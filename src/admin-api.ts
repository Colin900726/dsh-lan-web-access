/**
 * 管理接口：`/login` 和 `/api/remote-access/*`。
 * 改设置、密码、允许列表、更新、踢下线只限本机；局域网设备走局域网入口自己的登录。
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import {
  ipInCidr,
  isLocalOrigin,
  isLoopbackAddress,
  isValidWhitelistValue,
  normalizeIp,
} from './trust.ts';
import { effectiveLanPort, isValidPort, isValidSessionMaxAgeDays } from './settings.ts';
import { computerName } from './machine-name.ts';
import { hashPassword, makeSalt, makeSessionSecret, MIN_PASSWORD_LENGTH } from './session-store.ts';
import { sessionCookieClear, readSessionToken } from './cookies.ts';
import {
  authorityOf,
  issueNativeCookie,
  loadSigningSecret,
  expireNativeCookie,
  nativeCookieFingerprint,
  setCookieValue,
  NATIVE_COOKIE_MAX_AGE_SEC,
} from './native-cookie.ts';
import { handleLoginPost, loginPageHtml, loginView, sendHtml } from './login.ts';
import { readDshVersion } from './selfcheck.ts';
import {
  checkLatestVersion,
  manualUpdateCommand,
  allowLatestInstall,
  runUpdate,
} from './updater.ts';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { rawService } from './cordis-raw.ts';
import { buildDevicesView } from './devices.ts';
import {
  ERROR_CODES,
  GATEWAY_HEADER,
  type Edition,
  type ErrorCode,
  type RemoteAccessStatus,
} from './shared.ts';
import type { Runtime } from './runtime.ts';
import type { Settings, WhitelistEntry } from './settings.ts';

export { GATEWAY_HEADER };
export { PACKAGE_NAME } from './updater.ts';

export function clientIp(req: IncomingMessage): string {
  return req.socket?.remoteAddress ?? 'unknown';
}

/** 一块网卡的 IPv4 地址（设置页用来显示访问地址）。 */
export interface LanIpInfo {
  /** 网卡名，如 `en0` / `eth0` / `Wi-Fi`。 */
  name: string;
  /** IPv4 地址。 */
  address: string;
}

/** 本机网卡的 IPv4 地址（不含回环和 169.254）。 */
export function listLanIps(): LanIpInfo[] {
  const found: LanIpInfo[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.internal) continue;
      if (item.family !== 'IPv4' || !item.address) continue;
      // 169.254 别的设备访问不到。
      if (item.address.startsWith('169.254.')) continue;
      found.push({ name, address: item.address });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address));
}

/**
 * 是不是本机发来的：本机地址、没经过局域网入口，而且是 dsh 自己的页面发的。
 * 后一条防的是本机浏览器里别的网页借机改设置：浏览器带了来源信息就必须和 dsh 同源。
 */
export function isLocalRequest(req: IncomingMessage): boolean {
  if (!isLocalOrigin(req.socket?.remoteAddress, req.headers.host, false)) return false;
  if (req.headers[GATEWAY_HEADER] !== undefined) return false;
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${req.headers.host ?? ''}`) return false;
  return true;
}

export function jsonResponse(
  res: ServerResponse,
  status: number,
  data: object,
  headers: Record<string, string | string[]> = {},
): void {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

export async function parseJsonBody(
  req: IncomingMessage,
  maxBytes = 1024 * 1024,
): Promise<Record<string, unknown>> {
  // 只收 JSON：别的网页发跨源 JSON 请求会被浏览器先拦下（预检）。
  const type = String(req.headers['content-type'] ?? '').toLowerCase();
  if (!type.startsWith('application/json'))
    throw new Error('content-type must be application/json');
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sanitizeSettings(s: Settings): Record<string, unknown> {
  return {
    enabled: s.enabled,
    allowLoopback: s.allowLoopback,
    lanEnabled: s.lanEnabled,
    lanHost: s.lanHost,
    lanPort: s.lanPort,
    whitelist: s.whitelist,
    whitelistEmptyMode: s.whitelistEmptyMode,
    whitelistBypassPassword: s.whitelistBypassPassword,
    sessionMaxAgeDays: s.sessionMaxAgeDays,
    registered: s.passwordHash !== null,
  };
}

/** 运行环境：按 dsh profile 名判断是 Desktop 还是 Web。 */
export function editionOf(profile: string): Edition {
  if (profile === 'desktop') return 'desktop';
  if (profile === 'web') return 'web';
  return 'unknown';
}

/** 状态接口的内容：本机多给已登录数和网卡列表，局域网设备多给它自己的 IP。 */
export function buildStatus(
  rt: Runtime,
  view: {
    local: boolean;
    trusted: boolean;
    authenticated: boolean;
    port: number;
    clientIp: string;
    withLanIps: boolean;
  },
): RemoteAccessStatus {
  const s = rt.settingsStore.get();
  return {
    enabled: s.enabled,
    allowLoopback: s.allowLoopback,
    lanEnabled: s.lanEnabled,
    registered: s.passwordHash !== null,
    authenticated: view.authenticated,
    trusted: view.trusted,
    local: view.local,
    version: rt.version,
    dshVersion: readDshVersion() ?? null,
    profile: rt.profile,
    edition: editionOf(rt.profile),
    port: view.port,
    ...(view.withLanIps ? { lanIps: listLanIps() } : {}),
    lan: rt.lanState(),
    passwordSetAt: s.passwordSetAt,
    sessionMaxAgeDays: s.sessionMaxAgeDays,
    machineName: computerName(),
    checks: rt.checks,
    checkedAt: rt.checkedAt,
    fault: rt.fault(),
    ...(view.local
      ? { loggedIn: rt.sessions.list().length, update: rt.update }
      : { clientIp: view.clientIp }),
  };
}

export type SettingsPatchResult =
  { ok: true; patch: Partial<Settings> } | { ok: false; error: string; code: ErrorCode };

/** 校验前端提交的设置改动。 */
export function coerceSettingsPatch(
  body: Record<string, unknown>,
  current: Settings,
  mainPort: number,
): SettingsPatchResult {
  const patch: Partial<Settings> = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.allowLoopback === 'boolean') {
    // 没设密码时关掉本机免登录，浏览器就谁都进不去了。
    if (!body.allowLoopback && current.passwordHash === null)
      return { ok: false, error: '需要先设置管理密码', code: ERROR_CODES.passwordRequired };
    patch.allowLoopback = body.allowLoopback;
  }
  if (typeof body.lanEnabled === 'boolean') {
    if (body.lanEnabled && current.passwordHash === null)
      return { ok: false, error: '需要先设置管理密码', code: ERROR_CODES.passwordRequired };
    patch.lanEnabled = body.lanEnabled;
  }
  if (typeof body.lanHost === 'string') {
    if (body.lanHost !== '' && !listLanIps().some((i) => i.address === body.lanHost))
      return { ok: false, error: '网卡不存在', code: ERROR_CODES.hostUnavailable };
    patch.lanHost = body.lanHost;
  }
  if (body.lanPort === null) patch.lanPort = null;
  if (typeof body.lanPort === 'number') {
    if (!isValidPort(body.lanPort, mainPort))
      return { ok: false, error: '端口非法', code: ERROR_CODES.invalidPort };
    patch.lanPort = body.lanPort;
  }
  if (Array.isArray(body.whitelist)) {
    const list: WhitelistEntry[] = [];
    for (const e of body.whitelist) {
      if (!e || typeof e !== 'object')
        return { ok: false, error: '白名单条目非法', code: ERROR_CODES.invalidSetting };
      const entry = e as Record<string, unknown>;
      if (
        typeof entry.name !== 'string' ||
        typeof entry.value !== 'string' ||
        typeof entry.id !== 'string'
      ) {
        return { ok: false, error: '白名单条目非法', code: ERROR_CODES.invalidSetting };
      }
      if (!isValidWhitelistValue(entry.value))
        return {
          ok: false,
          error: `白名单值非法：${entry.value}`,
          code: ERROR_CODES.invalidSetting,
        };
      const value = entry.value.trim();
      if (list.some((x) => x.value === value))
        return { ok: false, error: `重复的地址：${value}`, code: ERROR_CODES.duplicate };
      list.push({ id: entry.id, name: entry.name.trim(), value });
    }
    patch.whitelist = list;
  }
  if (body.whitelistEmptyMode === 'deny-all' || body.whitelistEmptyMode === 'private-only') {
    patch.whitelistEmptyMode = body.whitelistEmptyMode;
  }
  if (typeof body.whitelistBypassPassword === 'boolean')
    patch.whitelistBypassPassword = body.whitelistBypassPassword;
  if (body.sessionMaxAgeDays !== undefined) {
    if (!isValidSessionMaxAgeDays(body.sessionMaxAgeDays))
      return { ok: false, error: '会话有效期非法', code: ERROR_CODES.invalidSetting };
    patch.sessionMaxAgeDays = body.sessionMaxAgeDays;
  }
  return { ok: true, patch };
}

/** 挂在 webServer 上的注册记录：重新注册时先拆掉旧的。 */
const ADMIN_RECORD = Symbol.for('dsh-lan-web-access.admin-api');

interface AdminRecord {
  dispose(): void;
}

/** 注册管理接口，返回撤销函数。 */
export function registerAdminApi(rt: Runtime): () => void {
  const { webServer, settingsStore, sessions, getCredentials } = rt;
  const holder = rawService(webServer) as unknown as Record<symbol, AdminRecord | undefined> & {
    exact?: Map<string, WebRoute>;
    prefixes?: Map<string, WebRoute>;
  };
  const previous = holder[ADMIN_RECORD];
  if (previous !== undefined) {
    rt.ctx.logger?.warn(
      'remote-access: admin routes already registered on this webServer, taking over',
    );
    previous.dispose();
  }

  const registered: Array<{ route: WebRoute; dispose: () => void }> = [];
  const route = (r: WebRoute): void => {
    registered.push({ route: r, dispose: webServer.register(r) });
  };
  const record: AdminRecord = {
    dispose() {
      if (holder[ADMIN_RECORD] !== record) return;
      delete holder[ADMIN_RECORD];
      for (const { route: r, dispose } of registered.reverse()) {
        // 路径上已经不是自己这条了就不删。
        const table = r.kind === 'prefix' ? holder.prefixes : holder.exact;
        if (table !== undefined && table.get(r.path) !== r) continue;
        try {
          dispose();
        } catch (error) {
          rt.ctx.logger?.warn(
            'remote-access: failed to remove route %s: %s',
            r.path,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      registered.length = 0;
    },
  };
  holder[ADMIN_RECORD] = record;

  try {
    // /login
    route({
      kind: 'exact',
      path: '/login',
      handler: async (req, res) => {
        const ip = clientIp(req);
        sendHtml(
          res,
          200,
          loginPageHtml(loginView(rt, ip, isLocalOrigin(ip, req.headers.host, false))),
        );
      },
    });

    // 状态（公开）。
    route({
      kind: 'exact',
      path: '/api/remote-access/status',
      handler: async (req, res) => {
        const local = isLocalRequest(req);
        const trusted = isLocalOrigin(req.socket?.remoteAddress, req.headers.host, false);
        const session = sessions.validate(readSessionToken(req) ?? '');
        const s = settingsStore.get();
        jsonResponse(
          res,
          200,
          buildStatus(rt, {
            local,
            trusted,
            authenticated:
              !s.enabled || rt.fault() || (trusted && s.allowLoopback) || session !== undefined,
            port: webServer.port,
            clientIp: clientIp(req),
            // 网卡列表只给本机看。
            withLanIps: local,
          }),
        );
      },
    });

    // 登录（本机免登录关着时，本机用）。
    route({
      kind: 'exact',
      path: '/api/remote-access/login',
      handler: async (req, res) => {
        const ip = clientIp(req);
        // 局域网设备走局域网入口的登录（那里有允许列表和限速），这里只给本机。
        if (!isLoopbackAddress(req.socket?.remoteAddress)) {
          jsonResponse(res, 403, { error: '仅限本机', code: ERROR_CODES.localOnly });
          return;
        }
        await handleLoginPost(rt, req, res, {
          ip,
          exempt: isLocalRequest(req),
          // 顺便补上 dsh 的 cookie，省一次跳转。
          extraCookies: async () => {
            const authority = authorityOf(req.headers);
            const secret = await loadSigningSecret(getCredentials());
            if (authority === undefined || secret === undefined) return [];
            const cookie = issueNativeCookie(secret, authority);
            rt.recordPluginMint(
              nativeCookieFingerprint(setCookieValue(cookie)),
              Date.now() + NATIVE_COOKIE_MAX_AGE_SEC * 1000,
            );
            return [cookie];
          },
        });
      },
    });

    // 退出。
    route({
      kind: 'exact',
      path: '/api/remote-access/logout',
      handler: async (req, res) => {
        const token = readSessionToken(req);
        if (token) {
          const payload = sessions.validate(token);
          if (payload) {
            sessions.kick(payload.sid);
            rt.log.record('logout', clientIp(req), '退出登录');
          }
        }
        const cookies = [sessionCookieClear()];
        const authority = authorityOf(req.headers);
        if (authority !== undefined) cookies.push(expireNativeCookie(authority));
        jsonResponse(res, 200, { ok: true }, { 'set-cookie': cookies });
      },
    });

    /** 管理操作只限本机；本机免登录关着时还要先登录（见 guard.ts adminAllowed）。 */
    const requireLocal = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
      if (!isLocalRequest(req)) {
        jsonResponse(res, 403, { error: '仅限本机操作', code: ERROR_CODES.localOnly });
        return false;
      }
      if (await rt.adminAllowed(req)) return true;
      jsonResponse(res, 401, { error: '需要先登录', code: ERROR_CODES.loginRequired });
      return false;
    };

    // 读取/写入设置（本机）。
    route({
      kind: 'exact',
      path: '/api/remote-access/settings',
      handler: async (req, res) => {
        if (!(await requireLocal(req, res))) return;
        if (req.method === 'GET') {
          jsonResponse(res, 200, sanitizeSettings(settingsStore.get()));
          return;
        }
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        let body: Record<string, unknown>;
        try {
          body = await parseJsonBody(req);
        } catch {
          jsonResponse(res, 400, { error: '请求体非法', code: ERROR_CODES.invalidBody });
          return;
        }
        const result = coerceSettingsPatch(body, settingsStore.get(), webServer.port);
        if (!result.ok) {
          jsonResponse(res, 400, { error: result.error, code: result.code });
          return;
        }
        const before = settingsStore.get();
        settingsStore.update(result.patch);
        if (result.patch.whitelist !== undefined) {
          const kept = new Set(result.patch.whitelist.map((e) => e.value));
          for (const e of before.whitelist)
            if (!kept.has(e.value)) rt.log.record('removed', e.value, e.name || e.value);
        }
        const touchesLan = (['enabled', 'lanEnabled', 'lanHost', 'lanPort'] as const).some(
          (k) => k in result.patch,
        );
        if (touchesLan) {
          const lanError = await rt.syncLan();
          const wantsLan = settingsStore.get().lanEnabled && settingsStore.get().enabled;
          if (lanError !== undefined && wantsLan) {
            // 改完入口开不起来：退回原来的设置。
            settingsStore.update({
              lanEnabled: before.lanEnabled,
              lanHost: before.lanHost,
              lanPort: before.lanPort,
            });
            await rt.syncLan();
            const port = effectiveLanPort(
              {
                lanPort: result.patch.lanPort !== undefined ? result.patch.lanPort : before.lanPort,
              },
              webServer.port,
            );
            jsonResponse(res, 409, {
              error: lanError === 'port-in-use' ? `端口 ${port} 被占用` : '局域网入口开不起来',
              code:
                lanError === 'port-in-use' ? ERROR_CODES.portInUse : ERROR_CODES.hostUnavailable,
              port,
            });
            return;
          }
        }
        jsonResponse(res, 200, sanitizeSettings(settingsStore.get()));
      },
    });

    // 设置/重置密码（本机）。
    route({
      kind: 'exact',
      path: '/api/remote-access/password',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        if (!(await requireLocal(req, res))) return;
        let body: Record<string, unknown>;
        try {
          body = await parseJsonBody(req);
        } catch {
          jsonResponse(res, 400, { error: '请求体非法', code: ERROR_CODES.invalidBody });
          return;
        }
        const password = typeof body.password === 'string' ? body.password : '';
        if (password.length < MIN_PASSWORD_LENGTH) {
          jsonResponse(res, 400, {
            error: `密码至少 ${MIN_PASSWORD_LENGTH} 位`,
            code: ERROR_CODES.tooShort,
          });
          return;
        }
        const passwordHash = hashPassword(password, makeSalt());
        const sessionSecret = makeSessionSecret();
        settingsStore.update({ passwordHash, sessionSecret, passwordSetAt: Date.now() });
        sessions.rotateSecret(sessionSecret);
        rt.ctx.logger?.info('remote-access: password changed');
        jsonResponse(res, 200, { ok: true });
      },
    });

    // 清除密码（本机）：移除密码并关闭局域网访问，全部会话下线。
    route({
      kind: 'exact',
      path: '/api/remote-access/password/clear',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        if (!(await requireLocal(req, res))) return;
        const sessionSecret = makeSessionSecret();
        // 没密码时本机免登录必须开着，否则谁都进不去。
        const reopenedLocal = !settingsStore.get().allowLoopback;
        settingsStore.update({
          passwordHash: null,
          passwordSetAt: null,
          sessionSecret,
          lanEnabled: false,
          allowLoopback: true,
        });
        rt.ctx.logger?.info('remote-access: password cleared, lan disabled');
        jsonResponse(res, 200, { ok: true, reopenedLocal });
      },
    });

    // 在线会话（本机）。
    route({
      kind: 'exact',
      path: '/api/remote-access/sessions',
      handler: async (req, res) => {
        if (!(await requireLocal(req, res))) return;
        jsonResponse(res, 200, { sessions: sessions.list() });
      },
    });

    // 踢下线（本机）。
    route({
      kind: 'exact',
      path: '/api/remote-access/kick',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        if (!(await requireLocal(req, res))) return;
        let body: Record<string, unknown>;
        try {
          body = await parseJsonBody(req);
        } catch {
          jsonResponse(res, 400, { error: '请求体非法', code: ERROR_CODES.invalidBody });
          return;
        }
        const sid = typeof body.sid === 'string' ? body.sid : '';
        const target = sessions.list().find((x) => x.sid === sid);
        const kicked = sessions.kick(sid);
        if (kicked && target)
          rt.log.record('kick', normalizeIp(target.ip) ?? target.ip, '被踢下线');
        rt.ctx.logger?.info('remote-access: kicked session %s', sid);
        jsonResponse(res, 200, { ok: true, kicked });
      },
    });

    // 全部下线（本机）。
    route({
      kind: 'exact',
      path: '/api/remote-access/kick-all',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        if (!(await requireLocal(req, res))) return;
        const all = sessions.list();
        sessions.kickAll();
        for (const x of all) rt.log.record('kick', normalizeIp(x.ip) ?? x.ip, '全部退出登录');
        jsonResponse(res, 200, { ok: true });
      },
    });

    // 设备列表（本机）。
    route({
      kind: 'exact',
      path: '/api/remote-access/devices',
      handler: async (req, res) => {
        if (!(await requireLocal(req, res))) return;
        const s = settingsStore.get();
        jsonResponse(
          res,
          200,
          buildDevicesView({
            whitelist: s.whitelist,
            sessions: sessions.list(),
            lastSeenByIp: rt.lastSeenByIp,
            bypassPassword: s.whitelistBypassPassword,
            emptyMode: s.whitelistEmptyMode,
            log: rt.log.list(),
          }),
        );
      },
    });

    // 访问日志（本机）。
    route({
      kind: 'exact',
      path: '/api/remote-access/logs',
      handler: async (req, res) => {
        if (!(await requireLocal(req, res))) return;
        const list = settingsStore.get().whitelist;
        jsonResponse(res, 200, {
          logs: rt.log.list().map((e) => ({
            ...e,
            name: list.find((w) => ipInCidr(e.ip, w.value))?.name ?? '',
          })),
        });
      },
    });

    // 一键更新（本机）。GET 查最新版本，POST 开始更新；关掉设置页也会继续。
    route({
      kind: 'exact',
      path: '/api/remote-access/update',
      handler: async (req, res) => {
        if (!(await requireLocal(req, res))) return;
        const busy = rt.update.state === 'running' || rt.update.state === 'done';
        if (req.method === 'GET') {
          if (!busy) {
            rt.update = { state: 'checking', current: rt.version };
            rt.update = await checkLatestVersion(rt.version);
          }
          jsonResponse(res, 200, rt.update);
          return;
        }
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        // 只有查到新版本、或上次失败要重试时才更新。
        const canRun = rt.update.state === 'available' || rt.update.state === 'failed';
        if (!canRun || rt.update.latest === undefined) {
          jsonResponse(res, 200, rt.update);
          return;
        }
        const target = rt.update.latest;
        rt.update = { state: 'running', current: rt.version, latest: target };
        let result: Awaited<ReturnType<typeof runUpdate>>;
        try {
          result = await runUpdate(rt.profile, target);
        } catch (error) {
          result = { ok: false, reason: 'failed', output: String(error) };
        }
        // 让以后只填包名也装最新版（见 allowLatestInstall）。
        if (result.ok) allowLatestInstall();
        rt.update = result.ok
          ? { state: 'done', current: rt.version, latest: target }
          : {
              state: 'failed',
              current: rt.version,
              latest: target,
              reason: result.reason ?? 'failed',
              // 手动命令只给 Web：Desktop 用户的电脑上一般没有 dsh 命令，界面改为指引去「插件」页。
              ...(rt.profile === 'desktop'
                ? {}
                : { command: manualUpdateCommand(rt.profile, target) }),
            };
        rt.log.record(
          'update',
          clientIp(req),
          result.ok ? `已更新到 ${target}` : `更新失败：${result.output.slice(-200)}`,
        );
        jsonResponse(res, 200, rt.update);
      },
    });

    // 运行检查：GET 看结果，POST 重新检查（本机）。
    route({
      kind: 'exact',
      path: '/api/remote-access/selfcheck',
      handler: async (req, res) => {
        if (req.method === 'POST') {
          if (!(await requireLocal(req, res))) return;
          await rt.recheck();
        }
        jsonResponse(res, 200, { checks: rt.checks, checkedAt: rt.checkedAt, fault: rt.fault() });
      },
    });
  } catch (error) {
    // 注册到一半失败：撤掉已注册的。
    record.dispose();
    throw error;
  }

  return () => record.dispose();
}
