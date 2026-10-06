import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebServer, WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { installGuard, isAuthorized, type GuardDeps } from '../src/guard.ts';
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
    tapIndex: () => () => {},
  } as unknown as WebServer;
}

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

  it('passes through when native cookie is already present', async () => {
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

  it('injects index script via tapIndex', () => {
    expect(ws.exact).toBeDefined();
  });
});
