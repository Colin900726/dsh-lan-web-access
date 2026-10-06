/**
 * 请求拦截：路由包装（会话闸门 + 原生 Cookie 补签）+ `connection/request` 权威闸门
 * + index 注入（ownsHost + randomUUID polyfill）。
 *
 * 包装策略：
 * - 回查包装已注册的 exact/prefix/upgrade/fallback，再包装后续注册；
 * - 公共路由（/login、/api/remote-access/*）不包装；
 * - 缺原生 cookie 的授权 GET/HEAD 请求现场补签：文档导航用 200 跳板页，其余用 303。
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
  logger: LoggerLike;
  isPublicRoute: (path: string) => boolean;
  /** 运行检查没通过、已安全退出：和总开关关掉一样，退回 dsh 官方认证（R-008）。 */
  suspended?: () => boolean;
  /** 局域网入口转发时带的令牌（本进程启动时随机生成，别的进程拿不到）。 */
  gatewayToken?: string;
  /** 「本机免登录」关着时，插件替本机浏览器签发了一条原生 cookie：记下它，以后不当作 dsh 签发的认。 */
  recordLockedMint?: (fingerprint: string, expiresAt: number) => void;
}

/**
 * 正在用 dsh 官方 token 换登录 cookie：`GET /?token=…`。Desktop 窗口每次启动都这样进来，
 * `dsh web` 打印的链接也是这样。token 由 dsh 自己校验，这里只是不拦、不替它补签。
 */
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
 * 带着 dsh 自己签发的登录 cookie：签名对、没过期、签发时间不早于「本机免登录」关掉的时刻，
 * 且不是插件在关着期间替密码登录签发的。Desktop 窗口用的就是这种。
 */
function hasDshIssuedCookie(req: IncomingMessage, deps: GuardDeps, s: Settings): boolean {
  const authority = authorityOf(req.headers);
  if (authority === undefined) return false;
  const value = readNativeCookie(req.headers, authority);
  if (value === undefined) return false;
  const secret = peekSigningSecret(deps.getCredentials());
  if (secret === undefined) return false;
  const payload = verifyNativeCookie(value, secret, authority);
  if (payload === undefined) return false;
  if (s.localLoginRequiredSince === null || payload.issuedAt < s.localLoginRequiredSince)
    return false;
  const fingerprint = nativeCookieFingerprint(value);
  return !s.lockedMintedCookies.some((x) => x.h === fingerprint);
}

/** 请求是不是本插件的局域网入口转发来的（它已经查过允许列表、来源和登录）。 */
function fromOwnGateway(req: IncomingMessage, token: string | undefined): boolean {
  const got = req.headers[GATEWAY_HEADER];
  if (token === undefined || typeof got !== 'string') return false;
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 插件此刻是否在接管认证：总开关开着、且没有安全退出。 */
function active(deps: GuardDeps): boolean {
  return deps.getSettings().enabled && deps.suspended?.() !== true;
}

/**
 * 守卫安装记录，挂在 webServer 原对象上（用全局 Symbol，热重载换了模块也能看到）。
 * 同一个 webServer 只允许一份守卫：新实例安装时先拆掉旧的；旧实例卸载时若记录已不是自己的，什么都不做。
 */
const GUARD_RECORD = Symbol.for('dsh-lan-web-access.guard');

interface GuardRecord {
  /** rollback = 安装失败时的回滚（日志措辞不同）。 */
  dispose(rollback?: boolean): void;
}

/**
 * 请求是否授权（插件没在接管时一律交给 dsh 自己认证）：
 * - 主服务上只认本机发来的请求。局域网设备必须走局域网入口，不能直连主端口（dsh 绑在 0.0.0.0 时）
 *   凭一个登录绕过允许列表和「局域网访问」开关；
 * - 局域网入口转发来的（带本进程令牌）：入口已经查过允许列表、来源和登录 / 免密，放行；
 * - 本机免登录开着、地址栏也是本机：放行；
 * - 否则要有效登录（本机免登录关着时，本机用密码登录）。
 */
export function isAuthorized(req: IncomingMessage, deps: GuardDeps): boolean {
  if (!active(deps)) return true;
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;
  if (fromOwnGateway(req, deps.gatewayToken)) return true;
  const s = deps.getSettings();
  if (s.allowLoopback && isLoopbackHost(req.headers.host)) return true;
  if (deps.sessions.validate(readSessionToken(req) ?? '') !== undefined) return true;
  // 本机免登录关着：本机浏览器除了插件密码，也可以走 dsh 官方的 token 方式（Desktop 窗口就是这样），
  // 「Desktop 不受这个开关影响」（用户 2026-10-05 定，2026-10-07 真机发现被拦后修）。
  if (!isLoopbackHost(req.headers.host)) return false;
  return isOfficialTokenExchange(req) || hasDshIssuedCookie(req, deps, s);
}

function replyJson(res: ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

/**
 * 安装守卫，返回撤销函数：撤销 index 注入、还原 webServer 的注册方法、把被包装过的
 * 路由与 fallback 换回原处理器。插件卸载（停用、热重载）时调用，之后可再次安装。
 */
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
  /** 逐个执行还原；某一步抛错不影响后面的步骤，返回第一个错误。 */
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
    // ── 1. index 注入：ownsHost + randomUUID polyfill ─────────────────────────
    // LAN 浏览器地址栏 hostname 非回环 → connection.isLoopback=false → ui-settings
    // mirror 退回 memory 模式（Models 等不可用）。ownsHost hook 让前端报告回环；
    // 明文 HTTP 非安全上下文缺 crypto.randomUUID，需 polyfill。
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

    // ── 2. 路由包装 ───────────────────────────────────────────────────────────
    const register = webServer.register.bind(webServer);
    const registerUpgrade = webServer.registerUpgrade.bind(webServer);
    const registerFallback = webServer.registerFallback.bind(webServer);
    /** 改写 webServer 上的方法；卸载时还原（原来是自身属性就放回，否则删掉露出原型方法）。 */
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

    /** 为已授权但缺原生 cookie 的 GET/HEAD 请求现场补签；接管了响应则返回 true。 */
    const settleCookie = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;
      // 用 dsh 官方 token 换 cookie 的那一下交给 dsh 自己处理，不替它补签。
      if (isOfficialTokenExchange(req)) return false;
      const authority = authorityOf(req.headers);
      if (authority === undefined || readNativeCookie(req.headers, authority) !== undefined)
        return false;
      const secret = await loadSigningSecret(getCredentials());
      if (secret === undefined) return false;
      const target = req.url ?? '/';
      const safe = target.startsWith('/') && !target.startsWith('//') ? target : '/';
      const cookie = issueNativeCookie(secret, authority);
      if (!deps.getSettings().allowLoopback)
        deps.recordLockedMint?.(
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
        if (!isAuthorized(req, deps)) {
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
        if (!isAuthorized(req, deps)) {
          socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
          return;
        }
        return original(req, socket, head);
      };
      route.handler = wrapped;
      restores.push(() => {
        if (route.handler === wrapped) route.handler = original;
      });
    };

    // 回查包装已注册路由（第三方插件可能先于本插件注册）。
    const tables = raw as unknown as {
      exact?: Map<string, WebRoute>;
      prefixes?: Map<string, WebRoute>;
      upgrades?: Map<string, WebUpgradeRoute>;
      fallback?: WebRoute['handler'];
    };
    for (const route of tables.exact?.values() ?? []) guardRoute(route);
    for (const route of tables.prefixes?.values() ?? []) guardRoute(route);
    for (const route of tables.upgrades?.values() ?? []) guardUpgradeRoute(route);
    /** fallback 换成包装版，卸载时若座位上仍是包装版就换回原处理器。 */
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
    // 装到一半失败：把已经装上的撤掉，不留半套守卫。
    record.dispose(true);
    throw error;
  }

  logger.info('remote-access: guard installed');
  return () => record.dispose();
}
