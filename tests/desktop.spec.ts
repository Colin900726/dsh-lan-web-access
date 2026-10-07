// 「本机免登录」关着时 Desktop 自己被拦（2026-10-07 真机发现）：Desktop 启动时用 dsh 的 token 换 cookie，
// 窗口和 API 都凭这张 dsh 签发的 cookie。修复后的规则逐条一个测试。
import { describe, it, expect, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebServer, WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { adminAllowed, installGuard, isAuthorized, type GuardDeps } from '../src/guard.ts';
import { SessionManager } from '../src/session-store.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings.ts';
import {
  issueNativeCookie,
  loadSigningSecret,
  nativeCookieFingerprint,
  setCookieValue,
  type CredentialsLike,
} from '../src/native-cookie.ts';
import { coerceSettingsPatch } from '../src/admin-api.ts';

const AUTHORITY = '127.0.0.1:19387';
const secret = Buffer.alloc(32, 9);
const credentials: CredentialsLike = {
  readRecord: () =>
    Promise.resolve({
      kind: 'grant',
      payload: { version: 1, secret: secret.toString('base64url') },
    }),
};

function req(opts: { url?: string; cookie?: string; host?: string; ip?: string; nav?: boolean }) {
  const headers: Record<string, string> = { host: opts.host ?? AUTHORITY };
  if (opts.cookie !== undefined) headers.cookie = opts.cookie;
  if (opts.nav) headers['sec-fetch-mode'] = 'navigate';
  return {
    method: 'GET',
    url: opts.url ?? '/',
    headers,
    socket: { remoteAddress: opts.ip ?? '127.0.0.1' },
  } as unknown as IncomingMessage;
}

/** dsh 自己（或插件）签发的原生 cookie：`name=value` 形式，外加原始值。 */
function cookieAt(issuedAt: number, key = secret, authority = AUTHORITY) {
  const set = issueNativeCookie(key, authority, issuedAt);
  return { header: set.slice(0, set.indexOf(';')), value: setCookieValue(set) };
}

let settings: Settings;
let deps: GuardDeps;
const SINCE = Date.now() - 60_000;

beforeEach(async () => {
  settings = {
    ...DEFAULT_SETTINGS,
    enabled: true,
    allowLoopback: false,
    passwordHash: 'salt:hash',
    mintTrackingSince: SINCE,
    pluginMintedCookies: [],
  };
  deps = {
    webServer: { port: 19387 } as unknown as WebServer,
    getSettings: () => settings,
    sessions: new SessionManager({ secret: 's', maxAgeDays: 14 }),
    getCredentials: () => credentials,
    logger: { info() {}, warn() {} },
    isPublicRoute: (p) => p.startsWith('/api/remote-access/'),
    recordPluginMint: (h, exp) => settings.pluginMintedCookies.push({ h, exp }),
  };
  await loadSigningSecret(credentials);
});

describe('本机免登录关着：Desktop 不受影响（Q-005）', () => {
  it('Given Desktop 启动时用 dsh 的 token 换 cookie（GET /?token=…），Then 放行交给 dsh 校验', () => {
    expect(isAuthorized(req({ url: '/?token=abc' }), deps)).toBe(true);
  });

  it('Given 地址栏不是本机（局域网 IP）带着 ?token=，Then 不放行', () => {
    expect(isAuthorized(req({ url: '/?token=abc', host: '192.168.1.20:19387' }), deps)).toBe(false);
  });

  it('Given 换 cookie 那一下，Then 插件不替它补签，dsh 自己的 303 + Set-Cookie 原样回给 Desktop', async () => {
    const routes = new Map<string, WebRoute>();
    const ws = {
      port: 19387,
      register: (r: WebRoute) => {
        routes.set(r.path, r);
        return () => routes.delete(r.path);
      },
      registerUpgrade: () => () => {},
      registerFallback: () => () => {},
      tapIndex: () => () => {},
    } as unknown as WebServer;
    installGuard({ ...deps, webServer: ws });
    // 模拟 dsh 的 authorizeIndex：收下 token，回 303 + 自己签发的 cookie。
    ws.register({
      kind: 'exact',
      path: '/',
      handler: (_q, res) => {
        res.writeHead(303, { location: './', 'set-cookie': 'dsh-auth-x=from-dsh; Path=/' });
        res.end();
      },
    } as WebRoute);
    let status = 0;
    let setCookie: unknown;
    const res = {
      writeHead(code: number, h: Record<string, unknown>) {
        status = code;
        setCookie = h['set-cookie'];
      },
      end() {},
    } as unknown as ServerResponse;
    await routes.get('/')!.handler(req({ url: '/?token=abc' }), res);
    expect(status).toBe(303);
    expect(setCookie).toBe('dsh-auth-x=from-dsh; Path=/');
    expect(settings.pluginMintedCookies).toHaveLength(0);
  });

  it('Given dsh 签发的 cookie（Desktop 窗口用的），Then 放行', () => {
    expect(isAuthorized(req({ cookie: cookieAt(Date.now()).header }), deps)).toBe(true);
  });

  it('Given Desktop 开着时在设置里关掉开关（窗口的 cookie 签发得比关开关早），When 不重启直接刷新，Then 照常放行', () => {
    const desktopCookie = cookieAt(SINCE + 1000); // Desktop 启动时用 token 换的
    settings.allowLoopback = true;
    expect(isAuthorized(req({ cookie: desktopCookie.header, nav: true }), deps)).toBe(true);
    settings.allowLoopback = false; // 现在才关
    expect(isAuthorized(req({ cookie: desktopCookie.header, nav: true }), deps)).toBe(true);
  });

  it('Given 开始记录插件签发的 cookie 之前签发的（分不清是谁签的），Then 不放行', () => {
    expect(isAuthorized(req({ cookie: cookieAt(SINCE - 1000).header }), deps)).toBe(false);
  });

  it('Given 插件自己签发过的 cookie（开着时补签的、密码登录时附带的），Then 不当作 dsh 签发的认', () => {
    const c = cookieAt(Date.now());
    settings.pluginMintedCookies.push({
      h: nativeCookieFingerprint(c.value),
      exp: Date.now() + 1e9,
    });
    expect(isAuthorized(req({ cookie: c.header }), deps)).toBe(false);
  });

  it('Given 签名不对、过期、或是别的地址的 cookie，Then 都不放行', () => {
    const forged = cookieAt(Date.now(), Buffer.alloc(32, 1));
    expect(isAuthorized(req({ cookie: forged.header }), deps)).toBe(false);
    const expired = cookieAt(Date.now() - 31 * 86_400_000);
    settings.mintTrackingSince = Date.now() - 40 * 86_400_000;
    expect(isAuthorized(req({ cookie: expired.header }), deps)).toBe(false);
    const other = cookieAt(Date.now(), secret, 'localhost:19387');
    expect(isAuthorized(req({ cookie: other.header }), deps)).toBe(false);
  });

  it('Given 没有任何凭证的本机浏览器，Then 仍要密码（本机免登录关着的本意不变）', () => {
    expect(isAuthorized(req({}), deps)).toBe(false);
    expect(isAuthorized(req({ nav: true }), deps)).toBe(false);
  });

  it('Given 局域网设备带着 dsh cookie 直连主端口，Then 不放行', () => {
    const c = cookieAt(Date.now());
    expect(
      isAuthorized(req({ cookie: c.header, ip: '192.168.1.45', host: '192.168.1.20:19387' }), deps),
    ).toBe(false);
  });
});

describe('真 dsh 里的 credentials 是 cordis 代理：每次拿到的都是新包的一层', () => {
  it('Given 每次 getCredentials 都返回新的代理对象，Then 同步校验仍能用上已读到的密钥（2026-10-07 Desktop 真机踩到）', async () => {
    const raw = {
      readRecord: () =>
        Promise.resolve({
          kind: 'grant',
          payload: { version: 1, secret: secret.toString('base64url') },
        }),
    };
    const proxy = () =>
      new Proxy(raw, {
        get: (t, k) => (k === Symbol.for('cordis.original') ? t : Reflect.get(t, k)),
      }) as unknown as CredentialsLike;
    await loadSigningSecret(proxy());
    const d = { ...deps, getCredentials: proxy };
    expect(isAuthorized(req({ cookie: cookieAt(Date.now()).header }), d)).toBe(true);
  });

  it('Given 每次都是全新的普通对象（拿不到原对象），Then 也能用上最近读到的密钥', async () => {
    const fresh = () =>
      ({
        readRecord: () =>
          Promise.resolve({
            kind: 'grant',
            payload: { version: 1, secret: secret.toString('base64url') },
          }),
      }) as CredentialsLike;
    await loadSigningSecret(fresh());
    const d = { ...deps, getCredentials: fresh };
    expect(isAuthorized(req({ cookie: cookieAt(Date.now()).header }), d)).toBe(true);
  });
});

describe('本机免登录开着时，插件替本机浏览器补签的 cookie 也记下', () => {
  it('Given 开关开着、浏览器没带 dsh cookie，When 打开页面，Then 插件补签一张并记下指纹；关掉开关后这张不再放行', async () => {
    settings.allowLoopback = true;
    const routes = new Map<string, WebRoute>();
    const ws = {
      port: 19387,
      register: (r: WebRoute) => {
        routes.set(r.path, r);
        return () => routes.delete(r.path);
      },
      registerUpgrade: () => () => {},
      registerFallback: () => () => {},
      tapIndex: () => () => {},
    } as unknown as WebServer;
    installGuard({ ...deps, webServer: ws });
    ws.register({ kind: 'exact', path: '/api/x', handler: () => {} } as unknown as WebRoute);
    let setCookie = '';
    const res = {
      writeHead(_code: number, h: Record<string, string>) {
        setCookie = h['set-cookie'] ?? setCookie;
      },
      setHeader() {},
      end() {},
    } as unknown as ServerResponse;
    await routes.get('/api/x')!.handler(req({ url: '/api/x' }), res);
    expect(settings.pluginMintedCookies).toHaveLength(1);
    settings.allowLoopback = false;
    const header = setCookie.slice(0, setCookie.indexOf(';'));
    expect(isAuthorized(req({ cookie: header }), deps)).toBe(false);
  });
});

describe('「本机免登录」开关切换', () => {
  it('Given 从开变关、从关变开，Then 不动 cookie 的记录（Desktop 窗口那张照常认）', () => {
    const on = { ...DEFAULT_SETTINGS, passwordHash: 'salt:hash', allowLoopback: true };
    const off = coerceSettingsPatch({ allowLoopback: false }, on, 19387);
    expect(off).toEqual({ ok: true, patch: { allowLoopback: false } });
    const again = coerceSettingsPatch(
      { allowLoopback: true },
      { ...on, allowLoopback: false },
      19387,
    );
    expect(again).toEqual({ ok: true, patch: { allowLoopback: true } });
  });
});

describe('本机免登录关着时，管理操作也要登录（用户 2026-10-07 拍板「堵上」）', () => {
  it('Given 开关开着，Then 本机管理操作放行', async () => {
    settings.allowLoopback = true;
    expect(await adminAllowed(req({}), deps)).toBe(true);
  });
  it('Given 开关关着、本机没有任何登录（开发者工具、命令行），Then 不放行', async () => {
    expect(await adminAllowed(req({}), deps)).toBe(false);
  });
  it('Given 开关关着、带着插件签发过的 cookie，Then 不放行', async () => {
    const c = cookieAt(Date.now());
    settings.pluginMintedCookies.push({
      h: nativeCookieFingerprint(c.value),
      exp: Date.now() + 1e9,
    });
    expect(await adminAllowed(req({ cookie: c.header }), deps)).toBe(false);
  });
  it('Given 开关关着、Desktop 窗口（dsh 签发的 cookie），Then 放行', async () => {
    expect(await adminAllowed(req({ cookie: cookieAt(Date.now()).header }), deps)).toBe(true);
  });
  it('Given 开关关着、用密码登录过的本机浏览器，Then 放行', async () => {
    const token = deps.sessions.create('admin', '127.0.0.1', 'UA');
    expect(await adminAllowed(req({ cookie: `dsh_sid=${token}` }), deps)).toBe(true);
  });
});
