/**
 * 请求拦截：给 dsh 的每个路由套一层登录检查，并给通过的请求补上 dsh 自己要的登录 cookie。
 * 公共路由（/login、/api/remote-access/*）不拦。
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebServer, WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver';
import { timingSafeEqual } from 'node:crypto';
import { isLoopbackAddress, isLoopbackHost } from './trust.ts';
import { GATEWAY_HEADER } from './shared.ts';
import { rawService } from './cordis-raw.ts';
import {
  authorityOf,
  readNativeCookie,
  loadSigningSecret,
  issueNativeCookie,
  bouncePage,
  isDocumentNavigation,
  peekSigningSecret,
  verifyNativeCookie,
  nativeCookieFingerprint,
  setCookieValue,
  NATIVE_COOKIE_MAX_AGE_SEC,
  type CredentialsLike,
} from './native-cookie.ts';
import { readSessionToken } from './cookies.ts';
import type { SessionManager } from './session-store.ts';
import type { Settings } from './settings.ts';

export interface LoggerLike {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
}

export interface GuardDeps {
  webServer: WebServer;
  getSettings: () => Settings;
  sessions: SessionManager;
  getCredentials: () => CredentialsLike | undefined;
  /**
   * 请 dsh 自己验证请求里的登录 cookie：true 通过、false 不通过、undefined 问不了。
   * 插件读不到签名密钥时（dsh 升级改了格式）用它，dsh 自己照样认得出。
   */
  dshAuthenticates?: (req: IncomingMessage) => boolean | undefined;
  logger: LoggerLike;
  isPublicRoute: (path: string) => boolean;
  /** 运行检查没通过：和关掉总开关一样，交回 dsh 官方认证。 */
  suspended?: () => boolean;
  /** 局域网入口转发时带的令牌（每次启动随机生成）。 */
  gatewayToken?: string;
  /** 记下插件自己签发的 cookie，以后不把它当成 dsh 签发的。 */
  recordPluginMint?: (fingerprint: string, expiresAt: number) => void;
}

/** 用 dsh 官方 token 换登录 cookie（`GET /?token=…`，Desktop 每次启动都这样）。交给 dsh 自己校验。 */
function isOfficialTokenExchange(req: IncomingMessage): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let url: URL;
  try {
    url = new URL(req.url ?? '/', 'http://x');
  } catch {
    return false;
  }
  return (url.pathname === '/' || url.pathname === '/index.html') && url.searchParams.has('token');
}

/**
 * 带着 dsh 自己签发的有效 cookie（Desktop 窗口用的就是这种）。
 * 插件签发的 cookie 用的是同一把密钥，靠记下的指纹区分；开始记录之前签发的分不清，不认。
 */
function hasDshIssuedCookie(req: IncomingMessage, deps: GuardDeps, s: Settings): boolean {
  const verified = validNativeCookie(req, deps);
  if (verified === undefined) return false;
  const { value, payload } = verified;
  if (s.mintTrackingSince === null || payload.issuedAt < s.mintTrackingSince) return false;
  const fingerprint = nativeCookieFingerprint(value);
  return !s.pluginMintedCookies.some((x) => x.h === fingerprint);
}

/** 带着签名有效的 dsh cookie（不管是 dsh 还是插件签的），返回它的值和内容。 */
function validNativeCookie(
  req: IncomingMessage,
  deps: GuardDeps,
): { value: string; payload: { issuedAt: number; expiresAt: number } } | undefined {
  const authority = authorityOf(req.headers);
  if (authority === undefined) return undefined;
  const value = readNativeCookie(req.headers, authority);
  if (value === undefined) return undefined;
  const secret = peekSigningSecret(deps.getCredentials());
  if (secret !== undefined) {
    const payload = verifyNativeCookie(value, secret, authority);
    return payload === undefined ? undefined : { value, payload };
  }
  // 插件读不到密钥：请 dsh 验签名。dsh 认了，内容就可信，直接读出签发时间。
  if (deps.dshAuthenticates?.(req) !== true) return undefined;
  try {
    const body = JSON.parse(
      Buffer.from(value.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as {
      issuedAt?: unknown;
      expiresAt?: unknown;
    };
    if (typeof body.issuedAt !== 'number' || typeof body.expiresAt !== 'number') return undefined;
    return { value, payload: { issuedAt: body.issuedAt, expiresAt: body.expiresAt } };
  } catch {
    return undefined;
  }
}

/** 是不是本插件的局域网入口转发来的（入口已经查过设备和登录）。 */
function fromOwnGateway(req: IncomingMessage, token: string | undefined): boolean {
  const got = req.headers[GATEWAY_HEADER];
  if (token === undefined || typeof got !== 'string') return false;
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 插件是否在接管认证：总开关开着，且运行检查通过。 */
function active(deps: GuardDeps): boolean {
  return deps.getSettings().enabled && deps.suspended?.() !== true;
}

/** 守卫挂在 webServer 上的记录：同一个 webServer 只留一份，重新安装时先拆旧的。 */
const GUARD_RECORD = Symbol.for('dsh-lan-web-access.guard');

interface GuardRecord {
  /** rollback：安装失败时回滚。 */
  dispose(rollback?: boolean): void;
}

/**
 * 请求是否放行：
 * - 主端口只认本机请求，局域网设备必须走局域网入口；
 * - 局域网入口转发来的、本机免登录开着的本机请求、有有效登录的：放行；
 * - 本机免登录关着时，本机还可以用 dsh 官方 token 登录（Desktop 不受这个开关影响）。
 */
export function isAuthorized(req: IncomingMessage, deps: GuardDeps): boolean {
  if (!active(deps)) return true;
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;
  if (fromOwnGateway(req, deps.gatewayToken)) return true;
  const s = deps.getSettings();
  if (s.allowLoopback && isLoopbackHost(req.headers.host)) return true;
  if (deps.sessions.validate(readSessionToken(req) ?? '') !== undefined) return true;
  if (!isLoopbackHost(req.headers.host)) return false;
  if (isOfficialTokenExchange(req)) {
    // 下一个请求就要校验 dsh 的 cookie，提前读签名密钥。
    peekSigningSecret(deps.getCredentials());
    return true;
  }
  return hasDshIssuedCookie(req, deps, s);
}

/** isAuthorized 的异步版：签名密钥还没读到时（插件刚启动），先等它读完再判一次。 */
export async function isAuthorizedAsync(req: IncomingMessage, deps: GuardDeps): Promise<boolean> {
  if (isAuthorized(req, deps)) return true;
  if (!isLoopbackAddress(req.socket?.remoteAddress) || !isLoopbackHost(req.headers.host))
    return false;
  const authority = authorityOf(req.headers);
  if (authority === undefined || readNativeCookie(req.headers, authority) === undefined)
    return false;
  const credentials = deps.getCredentials();
  if (credentials === undefined || peekSigningSecret(credentials) !== undefined) return false;
  if ((await loadSigningSecret(credentials)) === undefined) return false;
  return isAuthorized(req, deps);
}

/**
 * 本机的管理操作（改设置、改密码等）是否放行。调用前已确认是本机请求。
 * 平时和安全退出时一样（用户 2026-10-07 定）：
 * - 本机免登录开着：放行；
 * - 本机免登录关着：要有效登录（本机浏览器输密码），或 dsh 自己签发的 cookie（Desktop 窗口）。
 * 总开关被关掉时（回到 dsh 官方方式）：要有效登录或签名有效的 dsh cookie，
 * 免得本机任意程序不带 token 就能把插件重新打开。
 * 插件读不到签名密钥时，cookie 交给 dsh 自己验（见 validNativeCookie）。
 */
export async function adminAllowed(req: IncomingMessage, deps: GuardDeps): Promise<boolean> {
  const s = deps.getSettings();
  const masterOff = !s.enabled;
  if (!masterOff && s.allowLoopback) return true;
  if (deps.sessions.validate(readSessionToken(req) ?? '') !== undefined) return true;
  if (!isLoopbackHost(req.headers.host)) return false;
  const check = (): boolean =>
    masterOff
      ? validNativeCookie(req, deps) !== undefined
      : hasDshIssuedCookie(req, deps, deps.getSettings());
  if (check()) return true;
  const authority = authorityOf(req.headers);
  if (authority === undefined || readNativeCookie(req.headers, authority) === undefined)
    return false;
  await loadSigningSecret(deps.getCredentials());
  return check();
}

function replyJson(res: ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

/** 安装守卫，返回撤销函数（插件停用时把改过的东西全部还原）。 */
export function installGuard(deps: GuardDeps): () => void {
  const { webServer, logger, getCredentials } = deps;
  const raw = rawService(webServer);
  const holder = raw as unknown as Record<symbol, GuardRecord | undefined>;
  const previous = holder[GUARD_RECORD];
  if (previous !== undefined) {
    logger.warn('remote-access: guard already installed on this webServer, taking over');
    previous.dispose();
  }
  /** 卸载时按逆序执行的还原动作。 */
  const restores: Array<() => void> = [];
  /** 逐个还原，某一步出错不影响后面，返回第一个错误。 */
  const runRestores = (): unknown => {
    let firstError: unknown;
    for (const restore of restores.reverse()) {
      try {
        restore();
      } catch (error) {
        firstError ??= error;
      }
    }
    restores.length = 0;
    return firstError;
  };
  const record: GuardRecord = {
    dispose(rollback = false) {
      if (holder[GUARD_RECORD] !== record) return;
      delete holder[GUARD_RECORD];
      const error = runRestores();
      if (error === undefined)
        logger.info(
          rollback ? 'remote-access: guard install rolled back' : 'remote-access: guard removed',
        );
      else
        logger.warn(
          'remote-access: guard removal incomplete: %s',
          error instanceof Error ? error.message : String(error),
        );
    },
  };
  holder[GUARD_RECORD] = record;

  try {
    // ── 1. 往首页注入脚本 ──
    // 局域网设备的地址不是本机，dsh 前端会把部分设置（如 Models）变成只读，这里让它按本机处理；
    // 明文 HTTP 下浏览器没有 crypto.randomUUID，补一个。
    const untapIndex = webServer.tapIndex((html) => {
      const script = `<script>
;(function () {
  window.__DSH_TRANSPORT__ = window.__DSH_TRANSPORT__ || { ownsHost: true };
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function' && typeof crypto.getRandomValues === 'function') {
    crypto.randomUUID = function () {
      var b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      var out = '';
      for (var i = 0; i < 16; i++) {
        if (i === 4 || i === 6 || i === 8 || i === 10) out += '-';
        var hex = b[i].toString(16); if (hex.length < 2) hex = '0' + hex; out += hex;
      }
      return out;
    };
  }
})();
</script>`;
      return html.replace('</head>', `${script}</head>`);
    });
    restores.push(untapIndex);

    // ── 2. 包装路由 ──
    const register = webServer.register.bind(webServer);
    const registerUpgrade = webServer.registerUpgrade.bind(webServer);
    const registerFallback = webServer.registerFallback.bind(webServer);
    /** 改写 webServer 上的方法，卸载时还原。 */
    const patchMethod = <K extends 'register' | 'registerUpgrade' | 'registerFallback'>(
      key: K,
      replacement: WebServer[K],
    ): void => {
      const target = raw as unknown as Record<string, unknown>;
      const hadOwn = Object.prototype.hasOwnProperty.call(target, key);
      const previous = target[key];
      target[key] = replacement;
      restores.push(() => {
        if (target[key] !== replacement) return;
        if (hadOwn) target[key] = previous;
        else delete target[key];
      });
    };
    const guardedRoutes = new WeakSet<WebRoute>();
    const guardedUpgrades = new WeakSet<WebUpgradeRoute>();
    const guardedFallbacks = new WeakSet<WebRoute['handler']>();

    /** 放行的请求如果缺 dsh 的 cookie，现场补签；接管了响应返回 true。 */
    const settleCookie = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;
      if (isOfficialTokenExchange(req)) return false;
      const authority = authorityOf(req.headers);
      if (authority === undefined || readNativeCookie(req.headers, authority) !== undefined)
        return false;
      const secret = await loadSigningSecret(getCredentials());
      if (secret === undefined) return false;
      const target = req.url ?? '/';
      const safe = target.startsWith('/') && !target.startsWith('//') ? target : '/';
      const cookie = issueNativeCookie(secret, authority);
      deps.recordPluginMint?.(
        nativeCookieFingerprint(setCookieValue(cookie)),
        Date.now() + NATIVE_COOKIE_MAX_AGE_SEC * 1000,
      );
      if (isDocumentNavigation(req)) {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': cookie,
        });
        res.end(req.method === 'HEAD' ? undefined : bouncePage(safe));
      } else {
        res.writeHead(303, { location: safe, 'cache-control': 'no-store', 'set-cookie': cookie });
        res.end();
      }
      return true;
    };

    const guardHandler =
      (handler: WebRoute['handler']) =>
      async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!(await isAuthorizedAsync(req, deps))) {
          if ((req.method === 'GET' || req.method === 'HEAD') && isDocumentNavigation(req)) {
            res.writeHead(302, { location: '/login', 'cache-control': 'no-store' });
            res.end();
            return;
          }
          replyJson(res, 401, { error: 'unauthorized' });
          return;
        }
        if (active(deps) && (await settleCookie(req, res))) return;
        await handler(req, res);
      };

    const guardFallback = (handler: WebRoute['handler']): WebRoute['handler'] => {
      if (guardedFallbacks.has(handler)) return handler;
      guardedFallbacks.add(handler);
      const guarded = guardHandler(handler);
      return async (req, res) => {
        let pathname: string;
        try {
          pathname = new URL(req.url ?? '/', 'http://x').pathname;
        } catch {
          await guarded(req, res);
          return;
        }
        const isIndexPath = pathname === '/' || pathname === '/index.html';
        const isRead = req.method === 'GET' || req.method === 'HEAD';
        if (isRead && !isIndexPath) {
          // 静态资源（favicon、JS/CSS）保持公开。
          await handler(req, res);
          return;
        }
        await guarded(req, res);
      };
    };

    const guardRoute = (route: WebRoute): void => {
      if (guardedRoutes.has(route) || deps.isPublicRoute(route.path)) return;
      guardedRoutes.add(route);
      const original = route.handler;
      const wrapped = guardHandler(original);
      route.handler = wrapped;
      restores.push(() => {
        if (route.handler === wrapped) route.handler = original;
      });
    };

    const guardUpgradeRoute = (route: WebUpgradeRoute): void => {
      if (guardedUpgrades.has(route) || deps.isPublicRoute(route.path)) return;
      guardedUpgrades.add(route);
      const original = route.handler;
      const wrapped: WebUpgradeRoute['handler'] = (req, socket, head) => {
        if (isAuthorized(req, deps)) return original(req, socket, head);
        // 密钥还没读到时等一下再判，等待期间暂停读取，免得丢数据。
        socket.pause();
        void isAuthorizedAsync(req, deps).then(
          (ok) => {
            if (!ok) {
              socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
              return;
            }
            socket.resume();
            return original(req, socket, head);
          },
          () => socket.destroy(),
        );
      };
      route.handler = wrapped;
      restores.push(() => {
        if (route.handler === wrapped) route.handler = original;
      });
    };

    // 包装已经注册的路由（别的插件可能比本插件先注册）。
    const tables = raw as unknown as {
      exact?: Map<string, WebRoute>;
      prefixes?: Map<string, WebRoute>;
      upgrades?: Map<string, WebUpgradeRoute>;
      fallback?: WebRoute['handler'];
    };
    for (const route of tables.exact?.values() ?? []) guardRoute(route);
    for (const route of tables.prefixes?.values() ?? []) guardRoute(route);
    for (const route of tables.upgrades?.values() ?? []) guardUpgradeRoute(route);
    /** 把 fallback 换成包装版，卸载时换回。 */
    const trackFallback = (original: WebRoute['handler'], wrapped: WebRoute['handler']): void => {
      restores.push(() => {
        if (tables.fallback === wrapped) tables.fallback = original;
      });
    };
    if (tables.fallback !== undefined) {
      const original = tables.fallback;
      const wrapped = guardFallback(original);
      tables.fallback = wrapped;
      trackFallback(original, wrapped);
    }

    patchMethod('register', (route: WebRoute) => {
      guardRoute(route);
      return register(route);
    });
    patchMethod('registerUpgrade', (route: WebUpgradeRoute) => {
      guardUpgradeRoute(route);
      return registerUpgrade(route);
    });
    patchMethod('registerFallback', (handler: WebRoute['handler']) => {
      const wrapped = guardFallback(handler);
      trackFallback(handler, wrapped);
      return registerFallback(wrapped);
    });
  } catch (error) {
    // 装到一半失败：撤掉已装的部分。
    record.dispose(true);
    throw error;
  }

  logger.info('remote-access: guard installed');
  return () => record.dispose();
}
