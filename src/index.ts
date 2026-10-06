/**
 * dsh-lan-web-access 插件入口。
 *
 * 职责：装配运行时（设置/会话/限速/日志/credentials）、安装守卫（路由包装 +
 * 原生 Cookie 补签）、注册管理 API、启动局域网网关、订阅设置变更做热更新，
 * 并在 `connection/request` 官方扩展点加一道会话闸门（主防线）。
 *
 * 安全退出（R-008）：启动时跑五项运行检查，前四项任一不过 → 守卫不再补签、闸门放给 dsh 官方认证、
 * 局域网入口关闭；点「重新检查」或下次启动检查全过就自动恢复。
 */

import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SettingsStore } from './settings-store.ts';
import { SessionManager } from './session-store.ts';
import { createRateLimiter } from './ratelimit.ts';
import { AccessLog } from './access-log.ts';
import { installGuard, isAuthorized, type GuardDeps, type LoggerLike } from './guard.ts';
import { registerAdminApi, jsonResponse } from './admin-api.ts';
import { createGateway, whitelistAllows, type GatewayHandle } from './gateway.ts';
import { effectiveLanPort } from './settings.ts';
import { isLoopbackAddress } from './trust.ts';
import { listLanIps } from './admin-api.ts';
import type { LanState } from './shared.ts';
import { criticalFailures, readDshVersion, runSelfCheck } from './selfcheck.ts';
import type { Runtime } from './runtime.ts';
import type { CredentialsLike } from './native-cookie.ts';

export const name = 'dsh-lan-web-access';
export const inject = ['webServer'];

/**
 * 插件配置：没有。所有设置都在设置页里改，存在 `~/.dsh/remote-access.json`；
 * 不在 dsh 的插件配置里放一份不生效的同名项。
 */
export type Config = object;

export const Config: z<Config> = z.object({});

declare module '@deepseek-ai/cordis' {
  interface Events {
    'connection/request'(
      request: IncomingMessage,
      response: ServerResponse,
      next: () => Promise<void>,
    ): Promise<void>;
  }
}

function ownVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    return (require('../package.json') as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function detectProfile(ctx: Context): string {
  try {
    const pc = (ctx as unknown as { get(key: string): unknown }).get('profileContext') as
      { name?: string } | undefined;
    return pc?.name ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** 启动时等 dsh 登录签名就绪的次数（每次 1 秒）。 */
const STARTUP_WAIT_TRIES = 15;
/** 安全退出期间自动重查的间隔。 */
const FAULT_RECHECK_MS = 30_000;

const isPublicRoute = (path: string): boolean =>
  path === '/login' || path === '/oauth/callback' || path.startsWith('/api/remote-access/');

export function apply(ctx: Context, _config: Config): void {
  const webServer = ctx.webServer;
  const settingsStore = new SettingsStore();
  const settings = settingsStore.get();

  const sessions = new SessionManager({
    secret: settings.sessionSecret!,
    maxAgeDays: settings.sessionMaxAgeDays,
  });
  const rateLimiter = createRateLimiter();
  const log = new AccessLog(200);

  // 不缓存：credentials 服务可能在 connection 插件激活后才就绪，首次 miss 不应永久失效。
  const getCredentials = (): CredentialsLike | undefined => {
    try {
      return (ctx as unknown as { get(key: string): unknown }).get('credentials') as
        CredentialsLike | undefined;
    } catch {
      return undefined;
    }
  };

  const profile = detectProfile(ctx);
  const version = ownVersion();
  const logger: LoggerLike = {
    info: (m, ...a) => ctx.logger.info(m, ...a),
    warn: (m, ...a) => ctx.logger.warn(m, ...a),
  };

  const rt: Runtime = {
    ctx,
    webServer,
    settingsStore,
    sessions,
    rateLimiter,
    getCredentials,
    log,
    profile,
    version,
    lastSeenByIp: new Map(),
    checks: [],
    checkedAt: null,
    recheck: () => Promise.resolve([]),
    fault: () => criticalFailures(rt.checks).length > 0,
    update: { state: 'idle', current: version },
    gatewayToken: randomBytes(32).toString('hex'),
    // 下面两个在局域网入口装配好之后换成真的（见「局域网入口」一段）。
    syncLan: () => Promise.resolve(undefined),
    lanState: () => ({
      host: '',
      port: webServer.port + 1,
      portCustom: false,
      listening: false,
      hostMissing: false,
      hintDone: false,
    }),
  };

  // 组装守卫依赖（isAuthorized 供 connection/request 闸门复用）。
  const guardDeps: GuardDeps = {
    webServer,
    getSettings: () => settingsStore.get(),
    sessions,
    getCredentials,
    logger,
    isPublicRoute,
    suspended: () => rt.fault(),
    gatewayToken: rt.gatewayToken,
  };
  // 守卫与管理 API 都交给 ctx.effect：插件卸载（停用、热重载）时撤销，再加载时重新安装，不残留、不报重复路由。
  ctx.effect(() => installGuard(guardDeps));

  // 管理/认证 API。
  ctx.effect(() => registerAdminApi(rt));

  // 共享 API 会话闸门（官方 connection/request waterfall，主防线）。
  ctx.on('connection/request', async (request, response, next) => {
    if (!isAuthorized(request, guardDeps)) {
      jsonResponse(response, 401, { error: 'unauthorized' });
      return;
    }
    await next();
  });

  // 局域网入口（随设置启停）。同步串行执行：前一次开关还没完成时，后一次排队，不会两个端口一起开。
  let gateway: GatewayHandle | undefined;
  /** 插件已卸载（停用、热重载）：之后不再开入口、不再跑检查。 */
  let disposed = false;
  let lanError: LanState['error'];
  let lanQueue: Promise<LanState['error']> = Promise.resolve(undefined);
  const syncLan = (): Promise<LanState['error']> => {
    const next = lanQueue.then(async () => {
      // 卸载之后还在路上的设置请求，不能把入口重新打开、留下没人管的端口。
      if (disposed) {
        await gateway?.stop();
        return undefined;
      }
      const s = settingsStore.get();
      // 第一次运行检查跑完之前不开，免得检查没过还先开了一下。
      const want =
        s.lanEnabled &&
        s.enabled &&
        s.passwordHash !== null &&
        rt.checkedAt !== null &&
        !rt.fault();
      if (!want) {
        await gateway?.stop();
        lanError = undefined;
        return undefined;
      }
      if (gateway === undefined) gateway = createGateway(rt);
      if (s.lanHost !== '' && !listLanIps().some((i) => i.address === s.lanHost)) {
        await gateway.stop();
        lanError = 'host-unavailable';
        return lanError;
      }
      try {
        await gateway.start(s.lanHost, effectiveLanPort(s, webServer.port));
        lanError = undefined;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        lanError =
          code === 'EADDRINUSE'
            ? 'port-in-use'
            : code === 'EADDRNOTAVAIL'
              ? 'host-unavailable'
              : 'start-failed';
        logger.warn(
          'remote-access: gateway start failed: %s',
          error instanceof Error ? error.message : String(error),
        );
        log.record(
          'selfcheck-fail',
          'gateway',
          error instanceof Error ? error.message : String(error),
        );
      }
      return lanError;
    });
    // 队列本身不能卡在出错状态：这一次出错只回报给调用方，后面的开关照常排队。
    lanQueue = next.catch(() => undefined);
    return next;
  };
  rt.syncLan = syncLan;
  rt.lanState = (): LanState => {
    const s = settingsStore.get();
    return {
      host: s.lanHost,
      port: effectiveLanPort(s, webServer.port),
      portCustom: s.lanPort !== null,
      listening: gateway?.listening ?? false,
      ...(lanError !== undefined ? { error: lanError } : {}),
      hostMissing: s.lanHost !== '' && !listLanIps().some((i) => i.address === s.lanHost),
      hintDone: s.lanHintDone,
    };
  };
  // 运行检查。dsh 刚启动时登录签名可能还没准备好（connection 插件稍后才激活），
  // 启动时只有「读取 dsh 登录签名」没过就隔一秒再查，最多等 STARTUP_WAIT_TRIES 次，之后才算没通过。
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let faultTimer: ReturnType<typeof setTimeout> | undefined;
  rt.recheck = async () => {
    const wasFault = rt.fault();
    const results = await runSelfCheck(rt);
    if (disposed) return results;
    rt.checks = results;
    rt.checkedAt = Date.now();
    const failed = criticalFailures(results);
    if (failed.length > 0 && !wasFault) {
      logger.warn(
        'remote-access: self-check failed (%s), falling back to dsh auth',
        failed.map((f) => f.id).join(', '),
      );
      log.record('selfcheck-fail', 'dsh', failed.map((f) => f.id).join(','));
    } else if (failed.length === 0 && wasFault) {
      logger.info('remote-access: self-check passed again, resumed');
    }
    await syncLan();
    // 安全退出期间每 FAULT_RECHECK_MS 自动再查一次：签名晚到（dsh 刚装好还没生成）或换回兼容版本后自己恢复。
    clearTimeout(faultTimer);
    if (failed.length > 0 && !disposed)
      faultTimer = setTimeout(() => void rt.recheck(), FAULT_RECHECK_MS);
    return results;
  };
  const startupCheck = async (triesLeft: number): Promise<void> => {
    const results = await runSelfCheck(rt);
    if (disposed) return;
    const failed = criticalFailures(results);
    if (triesLeft > 0 && failed.length === 1 && failed[0]!.id === 'signing') {
      retryTimer = setTimeout(() => void startupCheck(triesLeft - 1), 1000);
      return;
    }
    await rt.recheck();
  };
  void startupCheck(STARTUP_WAIT_TRIES);

  // 追踪密钥轮换（改密码会写新 sessionSecret → 全部会话失效）。
  let seenSecret = settings.sessionSecret;
  const offSettings = settingsStore.onChange((next) => {
    if (next.sessionSecret !== null && next.sessionSecret !== seenSecret) {
      sessions.rotateSecret(next.sessionSecret);
      seenSecret = next.sessionSecret;
    }
    sessions.setMaxAgeDays(next.sessionMaxAgeDays);
    // 移出列表的设备：它的登录立刻失效（吊销会触发长连接清理）。本机登录（本机免登录关着时用）不受列表管。
    sessions.kickWhere((s) => !isLoopbackAddress(s.ip) && !whitelistAllows(s.ip, next));
    gateway?.enforce();
    // 设置变了（设 / 清密码、局域网开关等）就重跑一遍运行检查，「关于」里的结果跟着变；重查里会同步局域网入口。
    // 启动检查还没跑完时只同步入口（那时入口本来就不开）。
    if (rt.checkedAt !== null) rt.recheck().catch(() => undefined);
    else syncLan().catch(() => undefined);
  });
  const offRevoke = sessions.onRevoke((sids) => gateway?.enforce(sids));

  // 清理：先取消订阅，再等局域网入口真正关掉（端口释放后再启用才不会撞上 EADDRINUSE）。
  ctx.effect(() => {
    return async () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(faultTimer);
      offSettings();
      offRevoke();
      await lanQueue.catch(() => undefined);
      await gateway?.stop();
    };
  });

  ctx.logger.info(
    'remote-access: active (profile=%s, version=%s, dsh=%s, enabled=%s, lan=%s)',
    profile,
    version,
    readDshVersion() ?? 'unknown',
    settings.enabled,
    settings.lanEnabled,
  );
}
