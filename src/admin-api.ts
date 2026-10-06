/**
 * 管理/认证 API：注册到主 webServer 的 `/login` 与 `/api/remote-access/*`。
 *
 * 敏感操作（改设置/密码/白名单/更新/踢下线）只限「本机」——回环请求且未经
 * 局域网网关（网关会覆盖注入 `x-dsh-remote-gateway: 1` 标记）。登录/退出/状态
 * 供本机（allowLoopback=false）使用；局域网浏览器走网关自己的登录。
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
} from './native-cookie.ts';
import { handleLoginPost, loginPageHtml, loginView, sendHtml } from './login.ts';
import { readDshVersion } from './selfcheck.ts';
import { checkLatestVersion, manualUpdateCommand, runUpdate } from './updater.ts';
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

/** 一块网卡的 IPv4 信息，供设置页提示浏览器访问地址。 */
export interface LanIpInfo {
  /** 网卡名，如 `en0` / `eth0` / `Wi-Fi`。 */
  name: string;
  /** IPv4 地址。 */
  address: string;
}

/** 枚举本机网卡的 IPv4 地址（排除回环/内部接口与 169.254 链路本地地址），带网卡名。 */
export function listLanIps(): LanIpInfo[] {
  const found: LanIpInfo[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.internal) continue;
      if (item.family !== 'IPv4' || !item.address) continue;
      // 169.254/16 是链路本地地址，其他设备无法访问，排除以免误导。
      if (item.address.startsWith('169.254.')) continue;
      found.push({ name, address: item.address });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address));
}

/**
 * 是否「本机」：回环对端 + 回环 Host、没经过局域网入口，并且是 dsh 自己的页面发来的。
 *
 * 防 CSRF：本机浏览器里别的网页（包括同一台电脑其他端口上的页面——它们和 dsh 算同站不同源）
 * 可以向 127.0.0.1 发「简单请求」改密码、开局域网。所以浏览器带了来源信息就必须完全同源：
 * Origin 等于 `http://{Host}`（含端口），Sec-Fetch-Site 只能是 same-origin / none。
 * 不带这些头的（curl 等非浏览器客户端）不会替别人携带 cookie，放行。POST 体还必须是 JSON（见 parseJsonBody），
 * 跨源的 JSON 请求浏览器一定先预检，预检不会通过。
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
  // 只收 JSON：text/plain 这类「简单请求」不触发预检，别的网页能借浏览器发过来（见 isLocalRequest）。
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

/**
 * 组装 `/api/remote-access/status` 的返回内容。主服务和局域网入口都用这一个函数，
 * 两边只差「谁在看」：本机多给已登录数和网卡列表，非本机多给它自己的 IP。
 */
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

/** 校验并规范前端提交的设置补丁。 */
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

/**
 * 管理路由的注册记录，挂在 webServer 原对象上（全局 Symbol，热重载换了模块也能看到）。
 * 新实例注册前先拆掉旧实例的路由；旧实例卸载时若记录已被接管，什么都不做。
 */
const ADMIN_RECORD = Symbol.for('dsh-lan-web-access.admin-api');

interface AdminRecord {
  dispose(): void;
}

/** 注册管理/认证 API，返回撤销函数（插件卸载时移除全部路由，之后可再次注册）。 */
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
        // 真实 webServer 的撤销按路径无条件删除；路径上已不是自己这条就不动它。
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
      handler: (req, res) => {
        const ip = clientIp(req);
        sendHtml(
          res,
          200,
          loginPageHtml(loginView(rt, ip, isLocalOrigin(ip, req.headers.host, false))),
        );
      },
    });

    // 状态（公开，供前端判断 local/authenticated）。
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
            // 和闸门（guard.ts isAuthorized）的判断一致：插件没在接管时由 dsh 自己认证。
            authenticated:
              !s.enabled || rt.fault() || (trusted && s.allowLoopback) || session !== undefined,
            port: webServer.port,
            clientIp: clientIp(req),
            // 网卡列表只给本机看（局域网设备不需要知道这台电脑有哪些网卡）。
            withLanIps: local,
          }),
        );
      },
    });

    // 登录（本机 allowLoopback=false 时使用）。
    route({
      kind: 'exact',
      path: '/api/remote-access/login',
      handler: async (req, res) => {
        const ip = clientIp(req);
        // 主端口上的登录只给本机用（本机免登录关着时）。局域网设备一律走局域网入口的登录，
        // 那里有允许列表、来源检查和限速；直连主端口（dsh 绑在 0.0.0.0 时）不给登录。
        if (!isLoopbackAddress(req.socket?.remoteAddress)) {
          jsonResponse(res, 403, { error: '仅限本机', code: ERROR_CODES.localOnly });
          return;
        }
        await handleLoginPost(rt, req, res, {
          ip,
          exempt: isLocalRequest(req),
          // 本机登录成功时一并补上 dsh 原生通行证，省得再跳一次。
          extraCookies: async () => {
            const authority = authorityOf(req.headers);
            const secret = await loadSigningSecret(getCredentials());
            return authority !== undefined && secret !== undefined
              ? [issueNativeCookie(secret, authority)]
              : [];
          },
        });
      },
    });

    // 退出。
    route({
      kind: 'exact',
      path: '/api/remote-access/logout',
      handler: (req, res) => {
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

    const requireLocal = (req: IncomingMessage, res: ServerResponse): boolean => {
      if (isLocalRequest(req)) return true;
      jsonResponse(res, 403, { error: '仅限本机操作', code: ERROR_CODES.localOnly });
      return false;
    };

    // 读取/写入设置（本机）。
    route({
      kind: 'exact',
      path: '/api/remote-access/settings',
      handler: async (req, res) => {
        if (!requireLocal(req, res)) return;
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
            // 这次改动让入口开不起来：退回改动前的网卡 / 端口 / 开关，入口回到原样。
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
        if (!requireLocal(req, res)) return;
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
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        if (!requireLocal(req, res)) return;
        const sessionSecret = makeSessionSecret();
        // 本机免登录关着时清密码，浏览器就谁都进不去了：一并打开（用户 2026-10-05 确认）。
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
      handler: (req, res) => {
        if (!requireLocal(req, res)) return;
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
        if (!requireLocal(req, res)) return;
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
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        if (!requireLocal(req, res)) return;
        const all = sessions.list();
        sessions.kickAll();
        for (const x of all) rt.log.record('kick', normalizeIp(x.ip) ?? x.ip, '全部退出登录');
        jsonResponse(res, 200, { ok: true });
      },
    });

    // 设备列表（本机）：允许列表 + 登录状态 + 最近被拒的地址。
    route({
      kind: 'exact',
      path: '/api/remote-access/devices',
      handler: (req, res) => {
        if (!requireLocal(req, res)) return;
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
      handler: (req, res) => {
        if (!requireLocal(req, res)) return;
        const list = settingsStore.get().whitelist;
        jsonResponse(res, 200, {
          logs: rt.log.list().map((e) => ({
            ...e,
            name: list.find((w) => ipInCidr(e.ip, w.value))?.name ?? '',
          })),
        });
      },
    });

    // 一键更新（本机，R-007）。GET 在打开「关于」时查一次最新版本；POST 开始更新。
    // 更新在服务端跑，关掉设置页也会继续，结果记进访问记录；再打开「关于」看到的是这次的结果。
    route({
      kind: 'exact',
      path: '/api/remote-access/update',
      handler: async (req, res) => {
        if (!requireLocal(req, res)) return;
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
        if (busy || rt.update.latest === undefined) {
          jsonResponse(res, 200, rt.update);
          return;
        }
        const target = rt.update.latest;
        rt.update = { state: 'running', current: rt.version, latest: target };
        const result = await runUpdate(rt.profile);
        rt.update = result.ok
          ? { state: 'done', current: rt.version, latest: target }
          : {
              state: 'failed',
              current: rt.version,
              latest: target,
              reason: result.reason ?? 'failed',
              ...(result.reason === 'no-command'
                ? { command: manualUpdateCommand(rt.profile) }
                : {}),
            };
        rt.log.record(
          'update',
          clientIp(req),
          result.ok ? `已更新到 ${target}` : `更新失败：${result.output.slice(-200)}`,
        );
        jsonResponse(res, 200, rt.update);
      },
    });

    // 运行检查：GET 取最近一次结果（局域网设备也能看）；POST 重新检查（本机）。
    route({
      kind: 'exact',
      path: '/api/remote-access/selfcheck',
      handler: async (req, res) => {
        if (req.method === 'POST') {
          if (!requireLocal(req, res)) return;
          await rt.recheck();
        }
        jsonResponse(res, 200, { checks: rt.checks, checkedAt: rt.checkedAt, fault: rt.fault() });
      },
    });
  } catch (error) {
    // 注册到一半失败（如路径已被占用）：撤掉已注册的，免得下次启用撞上重复路由。
    record.dispose();
    throw error;
  }

  return () => record.dispose();
}
