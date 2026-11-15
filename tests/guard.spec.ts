import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  WebServer,
  WebRoute,
  WebResource,
  WebResourceRoute,
} from '@deepseek-ai/dsh-host-webserver';
import { guardHookable, installGuard, isAuthorized, type GuardDeps } from '../src/guard.ts';
import { SessionManager } from '../src/session-store.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings.ts';
import type { CredentialsLike } from '../src/native-cookie.ts';

function mockRes(): ServerResponse {
  const res: Record<string, unknown> = {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(code: number, h: Record<string, unknown>) {
      this.statusCode = code;
      Object.assign(this.headers, h);
    },
    end(d?: unknown) {
      this.body = d ?? '';
    },
  };
  return res as unknown as ServerResponse;
}

function mockReq(opts: {
  ip?: string;
  host?: string;
  method?: string;
  url?: string;
  cookie?: string;
  accept?: string;
  gateway?: string;
}): IncomingMessage {
  const headers: Record<string, string> = {};
  if (opts.gateway !== undefined) headers['x-dsh-remote-gateway'] = opts.gateway;
  if (opts.host !== undefined) headers.host = opts.host;
  if (opts.cookie !== undefined) headers.cookie = opts.cookie;
  if (opts.accept !== undefined) headers.accept = opts.accept;
  return {
    socket: { remoteAddress: opts.ip ?? '127.0.0.1' },
    headers,
    method: opts.method ?? 'GET',
    url: opts.url ?? '/',
  } as unknown as IncomingMessage;
}

function mockWebServer() {
  const exact = new Map<string, WebRoute>();
  const prefixes = new Map<string, WebRoute>();
  const upgrades = new Map<string, unknown>();
  let fallback: WebRoute['handler'] | undefined;
  return {
    exact,
    prefixes,
    upgrades,
    fallback,
    port: 19387,
    host: '127.0.0.1',
    register: (route: WebRoute) => {
      exact.set(route.path, route);
      return () => exact.delete(route.path);
    },
    registerUpgrade: (route: unknown) => {
      upgrades.set((route as { path: string }).path, route);
      return () => {};
    },
    registerFallback: (h: WebRoute['handler']) => {
      fallback = h;
      return () => {};
    },
    tapIndex: (fn: (html: string) => string) => {
      tapped.push(fn);
      return () => {};
    },
  } as unknown as WebServer;
}

/** 守卫注入首页的改写函数（tapIndex 收到的）。 */
const tapped: ((html: string) => string)[] = [];

const mockSecret = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
const mockCredentials: CredentialsLike = {
  async readRecord() {
    return { kind: 'grant', payload: { version: 1, secret: mockSecret.toString('base64url') } };
  },
};

let settings: Settings;
let sessions: SessionManager;
let deps: GuardDeps;
let ws: ReturnType<typeof mockWebServer>;

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS, enabled: true, allowLoopback: true };
  sessions = new SessionManager({ secret: 'test-secret', maxAgeDays: 14 });
  ws = mockWebServer();
  deps = {
    webServer: ws,
    getSettings: () => settings,
    sessions,
    getCredentials: () => mockCredentials,
    logger: { info: () => {}, warn: () => {} },
    isPublicRoute: (p) => p === '/login' || p.startsWith('/api/remote-access/'),
    gatewayToken: 'gw-token-of-this-process',
  };
  installGuard(deps);
});

describe('isAuthorized', () => {
  it('authorizes loopback when allowLoopback', () => {
    expect(isAuthorized(mockReq({ ip: '127.0.0.1', host: '127.0.0.1:19387' }), deps)).toBe(true);
  });
  it('rejects non-loopback without session', () => {
    expect(isAuthorized(mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19388' }), deps)).toBe(
      false,
    );
  });
  it('Given 局域网设备直连主端口（dsh 绑在 0.0.0.0）带着有效登录，Then 不放行，必须走局域网入口', () => {
    const token = sessions.create('admin', '192.168.1.5', 'UA');
    expect(
      isAuthorized(
        mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19387', cookie: `dsh_sid=${token}` }),
        deps,
      ),
    ).toBe(false);
  });
  it('Given 本机免登录关着、本机用密码登录过，Then 放行', () => {
    settings.allowLoopback = false;
    const token = sessions.create('admin', '127.0.0.1', 'UA');
    expect(isAuthorized(mockReq({ host: '127.0.0.1:19387' }), deps)).toBe(false);
    expect(
      isAuthorized(mockReq({ host: '127.0.0.1:19387', cookie: `dsh_sid=${token}` }), deps),
    ).toBe(true);
  });
  it('Given 本机免登录关着、免密设备经局域网入口转发（带本进程令牌），Then 放行；令牌不对不放行', () => {
    settings.allowLoopback = false;
    expect(
      isAuthorized(mockReq({ host: '127.0.0.1:19387', gateway: 'gw-token-of-this-process' }), deps),
    ).toBe(true);
    expect(isAuthorized(mockReq({ host: '127.0.0.1:19387', gateway: '1' }), deps)).toBe(false);
    // 令牌只在本机对端上认：局域网设备自己带上这个头也没用。
    expect(
      isAuthorized(
        mockReq({
          ip: '192.168.1.5',
          host: '127.0.0.1:19387',
          gateway: 'gw-token-of-this-process',
        }),
        deps,
      ),
    ).toBe(false);
  });
  it('passes everything when disabled', () => {
    settings.enabled = false;
    expect(isAuthorized(mockReq({ ip: '192.168.1.5', host: 'x' }), deps)).toBe(true);
  });
});

describe('route wrapping', () => {
  it('mints native cookie for loopback page navigation', async () => {
    const route: WebRoute = {
      kind: 'exact',
      path: '/x',
      handler: (_req, res) => {
        res.end('handled');
      },
    };
    ws.register(route);
    const res = mockRes();
    await route.handler(
      mockReq({ ip: '127.0.0.1', host: '127.0.0.1:19387', accept: 'text/html' }),
      res,
    );
    expect(res.statusCode).toBe(200);
    const setCookie = (res.headers as Record<string, unknown>)['set-cookie'] as string;
    expect(setCookie).toContain('dsh-auth-');
    expect(res.body).toContain('location.replace');
  });

  it('redirects unauthorized page navigation to /login', async () => {
    const route: WebRoute = {
      kind: 'exact',
      path: '/x',
      handler: (_req, res) => {
        res.end('handled');
      },
    };
    ws.register(route);
    const res = mockRes();
    await route.handler(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19388', accept: 'text/html' }),
      res,
    );
    expect(res.statusCode).toBe(302);
    expect((res.headers as Record<string, string>).location).toBe('/login');
  });

  it('passes through authorized RPC (POST) request', async () => {
    settings.allowLoopback = false;
    const token = sessions.create('admin', '127.0.0.1', 'UA');
    const route: WebRoute = {
      kind: 'exact',
      path: '/x',
      handler: (_req, res) => {
        res.end('handled');
      },
    };
    ws.register(route);
    const res = mockRes();
    await route.handler(
      mockReq({
        host: '127.0.0.1:19387',
        method: 'POST',
        cookie: `dsh_sid=${token}`,
      }),
      res,
    );
    expect(res.body).toBe('handled');
  });

  it('已带 dsh cookie 的已登录请求：不再补签，直接交给原处理器', async () => {
    settings.allowLoopback = false;
    const token = sessions.create('admin', '127.0.0.1', 'UA');
    const route: WebRoute = {
      kind: 'exact',
      path: '/x',
      handler: (_req, res) => {
        res.end('handled');
      },
    };
    ws.register(route);
    const res = mockRes();
    const authority = '127.0.0.1:19387';
    const nativeName = `dsh-auth-${createHash('sha256').update(authority).digest().toString('base64url')}`;
    const req = mockReq({
      host: authority,
      cookie: `dsh_sid=${token}; ${nativeName}=v1.abc.def`,
    });
    await route.handler(req, res);
    expect(res.body).toBe('handled');
  });

  it('does not wrap public routes', async () => {
    const route: WebRoute = {
      kind: 'exact',
      path: '/api/remote-access/status',
      handler: (_req, res) => {
        res.end('status');
      },
    };
    ws.register(route);
    const res = mockRes();
    await route.handler(mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19388' }), res);
    expect(res.body).toBe('status');
  });

  it('往首页注入脚本：让局域网设备上的 dsh 前端按本机处理，并补上 crypto.randomUUID', () => {
    const fn = tapped.at(-1);
    expect(fn).toBeDefined();
    const html = fn!('<html><head></head><body></body></html>');
    expect(html).toContain('ownsHost: true');
    expect(html).toContain('crypto.randomUUID');
  });
});

/**
 * 仿 dsh 0.2.2 起的网页服务：路由和兜底可以给 resource（Fetch 风格），
 * 分发顺序同 dsh：兜底是函数就直接调；有 resource 的走 serveResource；否则调 handler。
 */
class ResourceWebServer {
  exact = new Map<string, WebRoute | WebResourceRoute>();
  prefixes = new Map<string, WebRoute | WebResourceRoute>();
  upgrades = new Map<string, unknown>();
  fallback: WebRoute['handler'] | Pick<WebResourceRoute, 'resource'> | undefined;
  port = 19387;
  host = '127.0.0.1';
  register(route: WebRoute | WebResourceRoute): () => void {
    this.exact.set(route.path, route);
    return () => this.exact.delete(route.path);
  }
  registerUpgrade(route: { path: string }): () => void {
    this.upgrades.set(route.path, route);
    return () => this.upgrades.delete(route.path);
  }
  registerFallback(fallback: WebRoute['handler'] | Pick<WebResourceRoute, 'resource'>): () => void {
    this.fallback = fallback;
    return () => {
      this.fallback = undefined;
    };
  }
  tapIndex(): () => void {
    return () => {};
  }
  async readResource(): Promise<Response> {
    return new Response(null, { status: 404 });
  }
  async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const target = new URL(req.url ?? '/', 'http://x');
    const responder = this.exact.get(target.pathname) ?? this.fallback;
    if (responder === undefined) {
      res.writeHead(404, {});
      res.end();
      return;
    }
    if (typeof responder === 'function') await responder(req, res);
    else if ('resource' in responder)
      await this.serveResource(req, res, target, responder.resource);
    else await responder.handler(req, res);
  }
  async serveResource(
    _req: IncomingMessage,
    res: ServerResponse,
    target: URL,
    resource: WebResource,
  ): Promise<void> {
    const response = await resource(new Request(target));
    res.writeHead(response.status, {});
    res.end(await response.text());
  }
}

describe('dsh 0.2.2 起的 resource 路由', () => {
  const authority = '127.0.0.1:19387';
  const nativeName = `dsh-auth-${createHash('sha256').update(authority).digest().toString('base64url')}`;
  let rws: ResourceWebServer;
  let calls: string[];
  let dispose: () => void;
  const resource =
    (name: string): WebResource =>
    async (request) => {
      calls.push(`${name} ${new URL(request.url).pathname}`);
      return new Response(name);
    };

  beforeEach(() => {
    calls = [];
    rws = new ResourceWebServer();
    // dsh 的兜底（整个网页界面）先于插件注册，0.2.2 起是 { resource }。
    rws.registerFallback({ resource: resource('spa') });
    dispose = installGuard({ ...deps, webServer: rws as unknown as WebServer });
  });

  it('Given 具名 resource 路由，When 局域网设备直连主端口，Then 跳登录页、resource 不被调用', async () => {
    rws.register({ kind: 'exact', path: '/plugin-bundle', resource: resource('bundle') });
    const res = mockRes();
    await rws.dispatch(
      mockReq({
        ip: '192.168.1.5',
        host: '192.168.1.5:19387',
        url: '/plugin-bundle',
        accept: 'text/html',
      }),
      res,
    );
    expect(res.statusCode).toBe(302);
    expect(calls).toEqual([]);
  });

  it('Given 具名 resource 路由，When 本机免登录开着、已带 dsh cookie，Then 正常应答', async () => {
    rws.register({ kind: 'exact', path: '/plugin-bundle', resource: resource('bundle') });
    const res = mockRes();
    await rws.dispatch(
      mockReq({ host: authority, url: '/plugin-bundle', cookie: `${nativeName}=v1.abc.def` }),
      res,
    );
    expect(res.body).toBe('bundle');
  });

  it('Given 公共 resource 路由，Then 不拦', async () => {
    rws.register({ kind: 'exact', path: '/login', resource: resource('login') });
    const res = mockRes();
    await rws.dispatch(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19387', url: '/login' }),
      res,
    );
    expect(res.body).toBe('login');
  });

  it('Given { resource } 兜底，Then 不被改成函数；静态资源公开，首页要登录', async () => {
    expect(typeof rws.fallback).toBe('object');
    const asset = mockRes();
    await rws.dispatch(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19387', url: '/assets/index.js' }),
      asset,
    );
    expect(asset.body).toBe('spa');
    const index = mockRes();
    await rws.dispatch(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19387', url: '/', accept: 'text/html' }),
      index,
    );
    expect(index.statusCode).toBe(302);
    expect((index.headers as Record<string, string>).location).toBe('/login');
    expect(calls).toEqual(['spa /assets/index.js']);
  });

  it('Given { resource } 兜底，When 本机打开首页且已带 dsh cookie，Then 正常应答（不再报错 400）', async () => {
    const res = mockRes();
    await rws.dispatch(
      mockReq({
        host: authority,
        url: '/',
        accept: 'text/html',
        cookie: `${nativeName}=v1.abc.def`,
      }),
      res,
    );
    expect(res.body).toBe('spa');
  });

  it('Given 插件停用，Then serveResource 还原成 dsh 自己的', () => {
    expect(Object.prototype.hasOwnProperty.call(rws, 'serveResource')).toBe(true);
    dispose();
    expect(Object.prototype.hasOwnProperty.call(rws, 'serveResource')).toBe(false);
  });

  it('guardHookable：支持 resource 却找不到 serveResource 时为 false（运行检查据此安全退出）', () => {
    expect(guardHookable(rws as unknown as WebServer)).toBe(true);
    expect(guardHookable(ws)).toBe(true); // 0.2.0 式：没有 resource
    const broken = { readResource: async () => new Response(null) };
    expect(guardHookable(broken as unknown as WebServer)).toBe(false);
  });

  it('Given 插件停用，When 局域网设备再请求 resource 路由，Then 不再被插件拦（交回 dsh）', async () => {
    rws.register({ kind: 'exact', path: '/plugin-bundle', resource: resource('bundle') });
    dispose();
    const res = mockRes();
    await rws.dispatch(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19387', url: '/plugin-bundle' }),
      res,
    );
    expect(res.body).toBe('bundle');
  });

  it('Given 安装守卫之前已注册的具名 / 前缀 resource 路由，Then 同样要登录', async () => {
    const pre = new ResourceWebServer();
    pre.register({ kind: 'exact', path: '/early', resource: resource('early') });
    pre.prefixes.set('/pfx', { kind: 'prefix', path: '/pfx', resource: resource('pfx') });
    installGuard({ ...deps, webServer: pre as unknown as WebServer });
    const res = mockRes();
    await pre.dispatch(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19387', url: '/early' }),
      res,
    );
    expect(res.statusCode).toBe(401);
    const pfx = mockRes();
    await pre.serveResource(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19387', url: '/pfx/a' }),
      pfx,
      new URL('http://x/pfx/a'),
      pre.prefixes.get('/pfx')!.resource as WebResource,
    );
    expect(pfx.statusCode).toBe(401);
    expect(calls).toEqual([]);
  });

  it('Given 绕过 register 直接塞进路由表的 resource（认不出），Then 默认要登录', async () => {
    rws.exact.set('/sneaky', { kind: 'exact', path: '/sneaky', resource: resource('sneaky') });
    const res = mockRes();
    await rws.dispatch(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19387', url: '/sneaky' }),
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(calls).toEqual([]);
  });

  it('Given 安装之后才用 registerFallback({ resource }) 注册兜底，Then 静态资源公开、首页要登录', async () => {
    const late = new ResourceWebServer();
    installGuard({ ...deps, webServer: late as unknown as WebServer });
    late.registerFallback({ resource: resource('late') });
    expect(typeof late.fallback).toBe('object');
    const asset = mockRes();
    await late.dispatch(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19387', url: '/a.js' }),
      asset,
    );
    expect(asset.body).toBe('late');
    const index = mockRes();
    await late.dispatch(
      mockReq({
        ip: '192.168.1.5',
        host: '192.168.1.5:19387',
        url: '/index.html',
        accept: 'text/html',
      }),
      index,
    );
    expect(index.statusCode).toBe(302);
  });

  it('Given 经局域网入口转发（带网关令牌），Then resource 路由和兜底首页放行', async () => {
    rws.register({ kind: 'exact', path: '/plugin-bundle', resource: resource('bundle') });
    const viaGateway = (url: string) =>
      mockReq({
        host: authority,
        url,
        gateway: 'gw-token-of-this-process',
        cookie: `${nativeName}=v1.abc.def`,
      });
    const a = mockRes();
    await rws.dispatch(viaGateway('/plugin-bundle'), a);
    expect(a.body).toBe('bundle');
    const b = mockRes();
    await rws.dispatch(viaGateway('/'), b);
    expect(b.body).toBe('spa');
  });

  it('Given 本机已放行但缺 dsh cookie，Then resource 路由照旧补签 cookie（303），首页导航给跳转页', async () => {
    rws.register({ kind: 'exact', path: '/plugin-bundle', resource: resource('bundle') });
    const a = mockRes();
    await rws.dispatch(mockReq({ host: authority, url: '/plugin-bundle' }), a);
    expect(a.statusCode).toBe(303);
    expect((a.headers as Record<string, string>)['set-cookie']).toContain('dsh-auth-');
    const b = mockRes();
    await rws.dispatch(mockReq({ host: authority, url: '/', accept: 'text/html' }), b);
    expect(b.statusCode).toBe(200);
    expect((b.headers as Record<string, string>)['set-cookie']).toContain('dsh-auth-');
    expect(calls).toEqual([]);
  });

  it('Given 总开关关着，Then resource 路由不拦（交回 dsh 官方认证）', async () => {
    settings.enabled = false;
    rws.register({ kind: 'exact', path: '/plugin-bundle', resource: resource('bundle') });
    const res = mockRes();
    await rws.dispatch(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19387', url: '/plugin-bundle' }),
      res,
    );
    expect(res.body).toBe('bundle');
  });

  it('guardHookable：有 resource 路由但没有 readResource、serveResource 参数个数不对，都判 false', () => {
    const noRead = new ResourceWebServer() as unknown as Record<string, unknown>;
    noRead.readResource = undefined;
    noRead.serveResource = undefined;
    (noRead.exact as Map<string, unknown>).set('/r', {
      kind: 'exact',
      path: '/r',
      resource: resource('r'),
    });
    expect(guardHookable(noRead as unknown as WebServer)).toBe(false);
    const changed = new ResourceWebServer() as unknown as Record<string, unknown>;
    changed.serveResource = async (_a: unknown, _b: unknown) => {};
    expect(guardHookable(changed as unknown as WebServer)).toBe(false);
  });

  it('Given Desktop 启动握手（GET /?token=…，没有 dsh cookie），Then 原样交给 dsh 的兜底处理、不补签不跳转', async () => {
    // PR #1（iceleaf916）报告：0.1.9 在这里回 400，Desktop 拿不到 cookie、启动失败。
    const res = mockRes();
    await rws.dispatch(mockReq({ host: authority, url: '/?token=launch-token' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('spa');
    expect(calls).toEqual(['spa /']);
  });
});
