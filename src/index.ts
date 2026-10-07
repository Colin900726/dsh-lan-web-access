/**
 * 插件入口：装好登录检查、管理接口和局域网入口，设置变了就跟着更新。
 *
 * 启动时跑五项运行检查，前四项有没过的就「安全退出」：交回 dsh 官方认证、关掉局域网入口，
 * 检查重新通过后自动恢复。
 */

import { allowLatestInstall } from './updater.ts';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SettingsStore } from './settings-store.ts';
import { SessionManager } from './session-store.ts';
import { createRateLimiter } from './ratelimit.ts';
import { AccessLog } from './access-log.ts';
import {
  adminAllowed,
  installGuard,
  isAuthorizedAsync,
  type GuardDeps,
  type LoggerLike,
} from './guard.ts';
import { registerAdminApi, jsonResponse } from './admin-api.ts';
import { createGateway, whitelistAllows, type GatewayHandle } from './gateway.ts';
import { addMintRecord, defaultLanPort, effectiveLanPort } from './settings.ts';
import { isLoopbackAddress } from './trust.ts';
import { listLanIps } from './admin-api.ts';
import type { LanState } from './shared.ts';
import { criticalFailures, readDshVersion, runSelfCheck } from './selfcheck.ts';
import type { Runtime } from './runtime.ts';
import { loadSigningSecret, type CredentialsLike } from './native-cookie.ts';

export const name = 'dsh-lan-web-access';
export const inject = ['webServer'];

/** 插件配置：没有，设置都在设置页里改。 */
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

  // 第一次运行（或从旧版本升上来）：从现在开始记录插件签发的 cookie。
  if (settings.mintTrackingSince === null)
    settingsStore.update({ mintTrackingSince: Date.now(), pluginMintedCookies: [] }, false);

  const sessions = new SessionManager({
    secret: settings.sessionSecret!,
    maxAgeDays: settings.sessionMaxAgeDays,
  });
  const rateLimiter = createRateLimiter();
  const log = new AccessLog();

  // 每次现取：credentials 可能比本插件晚就绪。
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
  // 让以后只填包名也装最新版（见 allowLatestInstall）。
  if (allowLatestInstall()) ctx.logger.info('remote-access: release-age exclusion set to latest');
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
    recordPluginMint: (fingerprint, expiresAt) => {
      // 只写不通知：记一条指纹不算改设置，不用重跑运行检查。
      settingsStore.update(
        addMintRecord(settingsStore.get(), { h: fingerprint, exp: expiresAt }, Date.now()),
        false,
      );
    },
    // 等守卫依赖装好后换成真的。
    adminAllowed: () => Promise.resolve(false),
    // 下面两个等局域网入口装好后换成真的。
    syncLan: () => Promise.resolve(undefined),
    lanState: () => ({
      host: '',
      port: defaultLanPort(webServer.port),
      portCustom: false,
      listening: false,
      hostMissing: false,
      hintDone: false,
    }),
  };

  const guardDeps: GuardDeps = {
    webServer,
    getSettings: () => settingsStore.get(),
    sessions,
    getCredentials,
    logger,
    isPublicRoute,
    suspended: () => rt.fault(),
    gatewayToken: rt.gatewayToken,
    recordPluginMint: (fingerprint, expiresAt) => rt.recordPluginMint(fingerprint, expiresAt),
  };
  rt.adminAllowed = (req) => adminAllowed(req, guardDeps);
  // 交给 ctx.effect：插件停用时自动撤销。
  ctx.effect(() => installGuard(guardDeps));
  // 提前读 dsh 的签名密钥，Desktop 的第一个请求就要用。
  void loadSigningSecret(getCredentials());

  ctx.effect(() => registerAdminApi(rt));

  // dsh 官方的请求检查点：没通过的直接 401。
  ctx.on('connection/request', async (request, response, next) => {
    if (!(await isAuthorizedAsync(request, guardDeps))) {
      jsonResponse(response, 401, { error: 'unauthorized' });
      return;
    }
    await next();
  });

  // 局域网入口随设置开关。开关操作排队执行，不会同时开两个端口。
  let gateway: GatewayHandle | undefined;
  /** 插件已停用：之后不再开入口、不再跑检查。 */
  let disposed = false;
  let lanError: LanState['error'];
  let lanQueue: Promise<LanState['error']> = Promise.resolve(undefined);
  const syncLan = (): Promise<LanState['error']> => {
    const next = lanQueue.then(async () => {
      // 停用后不再开入口，免得留下没人管的端口。
      if (disposed) {
        await gateway?.stop();
        return undefined;
      }
      const s = settingsStore.get();
      // 第一次运行检查跑完之前不开。
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
    // 这次出错不影响后面排队的操作。
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
  // 运行检查。dsh 刚启动时签名密钥可能还没好：只差这一项时每秒重查，最多 STARTUP_WAIT_TRIES 次。
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
    // 安全退出期间定时重查，条件满足后自动恢复。
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

  // 改密码会换会话密钥，所有登录随之失效。
  let seenSecret = settings.sessionSecret;
  const offSettings = settingsStore.onChange((next) => {
    if (next.sessionSecret !== null && next.sessionSecret !== seenSecret) {
      sessions.rotateSecret(next.sessionSecret);
      seenSecret = next.sessionSecret;
    }
    sessions.setMaxAgeDays(next.sessionMaxAgeDays);
    // 移出允许列表的设备，登录立刻失效（本机登录不受影响）。
    sessions.kickWhere((s) => !isLoopbackAddress(s.ip) && !whitelistAllows(s.ip, next));
    gateway?.enforce();
    // 设置变了就重跑运行检查（会顺带同步局域网入口）；启动检查没跑完时只同步入口。
    if (rt.checkedAt !== null) rt.recheck().catch(() => undefined);
    else syncLan().catch(() => undefined);
  });
  const offRevoke = sessions.onRevoke((sids) => gateway?.enforce(sids));

  // 停用时：取消订阅，等局域网入口关掉、端口释放。
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
