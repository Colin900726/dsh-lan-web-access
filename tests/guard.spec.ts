import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebServer, WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { installGuard, isAuthorized, type GuardDeps } from '../src/guard.ts';
import { SessionManager } from '../src/session-store.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings.ts';
import type { CredentialsLike } from '../src/native-cookie.ts';

function chunkText(chunk: unknown): string {
  if (chunk === undefined || chunk === null) return '';
  if (typeof chunk === 'string') return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString('utf8');
  return String(chunk);
}

function mockRes(): ServerResponse {
  const res: Record<string, unknown> = {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(code: number, h: Record<string, unknown>) {
      this.statusCode = code;
      Object.assign(this.headers, h);
    },
    write(chunk: unknown) {
      this.body = String(this.body ?? '') + chunkText(chunk);
      return true;
    },
    end(d?: unknown) {
      if (d !== undefined) this.body = String(this.body ?? '') + chunkText(d);
    },
    on() {
      return this;
    },
    once() {
      return this;
    },
    off() {
      return this;
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
  let fallback: unknown;
  return {
    exact,
    prefixes,
    upgrades,
    port: 19387,
    host: '127.0.0.1',
    get fallback() {
      return fallback;
    },
    register: (route: WebRoute) => {
      exact.set(route.path, route);
      return () => exact.delete(route.path);
    },
    registerUpgrade: (route: unknown) => {
      upgrades.set((route as { path: string }).path, route);
      return () => {};
    },
    registerFallback: (seat: unknown) => {
      fallback = seat;
      return () => {
        fallback = undefined;
      };
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

/** 新版 dsh（0.2.1 起）的兜底席位：给的是 `{ resource }`，不是 handler 函数。 */
function resourceSeat(body: string, status = 200, headers: Record<string, string> = {}) {
  return {
    resource: async () => new Response(body, { status, headers }),
  };
}

describe('兜底席位（资源式）', () => {
  it('Given 兜底席位给的是 { resource }，Then 包成 handler 注册进 webserver，不再直接调资源', () => {
    ws.registerFallback(resourceSeat('index'));
    expect(typeof ws.fallback).toBe('function');
  });

  it('Given 本机请求首页，Then 补签 dsh cookie 并返回跳板页', async () => {
    let served = false;
    ws.registerFallback({
      resource: async () => {
        served = true;
        return new Response('index');
      },
    });
    const res = mockRes();
    await (ws.fallback as WebRoute['handler'])(
      mockReq({ host: '127.0.0.1:19387', accept: 'text/html' }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(String((res.headers as Record<string, unknown>)['set-cookie'])).toContain('dsh-auth-');
    expect(res.body).toContain('location.replace');
    // 补签这个请求就结束了，首页本身下一个请求再取。
    expect(served).toBe(false);
  });

  it('Given 未登录的局域网设备请求首页，Then 302 去 /login，不去碰资源', async () => {
    let served = false;
    ws.registerFallback({
      resource: async () => {
        served = true;
        return new Response('index');
      },
    });
    const res = mockRes();
    await (ws.fallback as WebRoute['handler'])(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19388', accept: 'text/html' }),
      res,
    );
    expect(res.statusCode).toBe(302);
    expect((res.headers as Record<string, string>).location).toBe('/login');
    expect(served).toBe(false);
  });

  it('Given 未授权的静态资源请求（非首页），Then 保持公开，照样交给资源', async () => {
    const seen: string[] = [];
    ws.registerFallback({
      resource: async (request) => {
        seen.push(request.url);
        return new Response('body{}', { headers: { 'content-type': 'text/javascript' } });
      },
    });
    const res = mockRes();
    await (ws.fallback as WebRoute['handler'])(
      mockReq({ ip: '192.168.1.5', host: '192.168.1.5:19388', url: '/assets/app.js' }),
      res,
    );
    expect(seen).toEqual(['http://192.168.1.5:19388/assets/app.js']);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('body{}');
  });

  it('Given 资源回了 303 + set-cookie（dsh 官方 token 换 cookie），Then 状态与 cookie 原样写出', async () => {
    ws.registerFallback(
      resourceSeat('', 303, { location: '/', 'set-cookie': 'dsh-auth-a=1; Path=/' }),
    );
    const res = mockRes();
    await (ws.fallback as WebRoute['handler'])(
      mockReq({ host: '127.0.0.1:19387', url: '/?token=t' }),
      res,
    );
    expect(res.statusCode).toBe(303);
    expect((res.headers as Record<string, string>).location).toBe('/');
    expect((res.headers as Record<string, unknown>)['set-cookie']).toEqual([
      'dsh-auth-a=1; Path=/',
    ]);
  });

  it('Given 非 GET/HEAD 走到兜底席位，Then 405 并带上 allow', async () => {
    let served = false;
    ws.registerFallback({
      resource: async () => {
        served = true;
        return new Response('x');
      },
    });
    const res = mockRes();
    await (ws.fallback as WebRoute['handler'])(
      mockReq({ host: '127.0.0.1:19387', method: 'POST', url: '/api/x' }),
      res,
    );
    expect(res.statusCode).toBe(405);
    expect((res.headers as Record<string, string>).allow).toBe('GET, HEAD');
    expect(served).toBe(false);
  });
});
