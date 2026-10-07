// 最终复核（2026-10-06）修掉的问题：每条一个回归测试。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createServer as createHttpServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createServer as createNetServer, connect } from 'node:net';
import { Readable } from 'node:stream';
import { isLocalRequest, parseJsonBody } from '../src/admin-api.ts';
import { createGateway } from '../src/gateway.ts';
import { isAuthorized } from '../src/guard.ts';
import { SettingsStore } from '../src/settings-store.ts';
import { SessionManager, hashPassword, makeSalt } from '../src/session-store.ts';
import { createRateLimiter, LOGIN_LIMITS } from '../src/ratelimit.ts';
import { AccessLog } from '../src/access-log.ts';
import { recentDenied } from '../src/devices.ts';
import { isValidWhitelistValue, whitelistValueKind } from '../src/shared.ts';
import { resolveUpdateCommand } from '../src/updater.ts';
import { fakeCredentials } from './helpers.ts';
import type { Runtime } from '../src/runtime.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-lan-review-'));
  process.env.DSH_REMOTE_ACCESS_FILE = join(dir, 'remote-access.json');
});
afterEach(() => {
  delete process.env.DSH_REMOTE_ACCESS_FILE;
  rmSync(dir, { recursive: true, force: true });
});

function req(headers: Record<string, string>, remote = '127.0.0.1'): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress: remote },
    method: 'POST',
  } as unknown as IncomingMessage;
}

describe('本机管理接口防 CSRF：只认 dsh 自己的页面', () => {
  const host = '127.0.0.1:3080';
  it('Given 同一台电脑别的端口上的网页发来请求（同站不同源），Then 不算本机', () => {
    expect(isLocalRequest(req({ host, origin: 'http://127.0.0.1:5173' }))).toBe(false);
    expect(isLocalRequest(req({ host, 'sec-fetch-site': 'same-site' }))).toBe(false);
    expect(isLocalRequest(req({ host, origin: 'http://localhost:3080' }))).toBe(false);
  });
  it('Given dsh 自己的页面（完全同源），或不带浏览器标记的 curl，Then 算本机', () => {
    expect(
      isLocalRequest(req({ host, origin: `http://${host}`, 'sec-fetch-site': 'same-origin' })),
    ).toBe(true);
    expect(isLocalRequest(req({ host }))).toBe(true);
  });
  it('Given 请求体不是 JSON（text/plain 简单请求不触发预检），Then 拒收', async () => {
    const r = Readable.from([Buffer.from('{"password":"x"}')]) as unknown as IncomingMessage;
    Object.assign(r, { headers: { 'content-type': 'text/plain' } });
    await expect(parseJsonBody(r)).rejects.toThrow();
  });
});

describe('允许列表的地址校验（前后端同一份）', () => {
  it('Given 网段斜杠后面空着（10.0.0.0/），Then 不合法（原来会被当成 /0 放行所有地址）', () => {
    expect(isValidWhitelistValue('10.0.0.0/')).toBe(false);
    expect(whitelistValueKind('10.0.0.0/8')).toBe('range');
  });
  it('Given 不像 IPv6 的冒号串，Then 不合法', () => {
    expect(isValidWhitelistValue(':::::')).toBe(false);
    expect(isValidWhitelistValue('1:2')).toBe(false);
    expect(whitelistValueKind('fe80::1')).toBe('single');
  });
});

describe('访问记录不被刷掉', () => {
  it('Given 同一台不在列表里的设备 1 分钟内被拒 300 次，Then 合并成一条记次数，其他记录还在', () => {
    const log = new AccessLog(200);
    log.record('login', '192.168.1.23', '登录成功');
    for (let i = 0; i < 300; i++) log.record('whitelist-deny', '192.168.1.45', '/');
    const list = log.list();
    expect(list).toHaveLength(2);
    expect(list.find((e) => e.kind === 'whitelist-deny')?.count).toBe(300);
    expect(recentDenied(list)[0]).toMatchObject({ ip: '192.168.1.45', count: 300 });
  });
});

describe('Windows 更新命令不拼入可疑的 profile 名', () => {
  it('Given profile 名带 shell 特殊字符，Then 不生成命令（界面给手动命令）', () => {
    expect(resolveUpdateCommand('web&calc', '0.1.5', 'win32', undefined)).toBeUndefined();
    expect(resolveUpdateCommand('web', '0.1.5', 'win32', undefined)?.cmd).toBe('dsh.cmd');
  });
});

// ── 局域网入口：用假的 dsh 主服务，主服务按插件的闸门判断放不放行 ─────────────────

interface Upstream {
  server: Server;
  port: number;
  hits: string[];
  closed: string[];
}

async function listen(server: Server | ReturnType<typeof createNetServer>): Promise<number> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return (server.address() as { port: number }).port;
}

async function freePort(): Promise<number> {
  const s = createNetServer();
  const p = await listen(s);
  await new Promise<void>((r) => s.close(() => r()));
  return p;
}

function makeRt(store: SettingsStore, upstreamPort: number): Runtime {
  return {
    settingsStore: store,
    sessions: new SessionManager({ secret: 's', maxAgeDays: 14 }),
    rateLimiter: createRateLimiter(),
    getCredentials: () => fakeCredentials(),
    log: new AccessLog(50),
    webServer: { port: upstreamPort },
    version: '0.1.0',
    profile: 'web',
    lastSeenByIp: new Map(),
    lanState: () => ({}),
    gatewayToken: 'gw-token',
  } as unknown as Runtime;
}

async function startUpstream(rtRef: () => Runtime): Promise<Upstream> {
  const hits: string[] = [];
  const closed: string[] = [];
  const server = createHttpServer((q: IncomingMessage, s: ServerResponse) => {
    const rt = rtRef();
    const ok = isAuthorized(q, {
      webServer: rt.webServer,
      getSettings: () => rt.settingsStore.get(),
      sessions: rt.sessions,
      getCredentials: rt.getCredentials,
      logger: { info() {}, warn() {} },
      isPublicRoute: () => false,
      gatewayToken: rt.gatewayToken,
    });
    hits.push(`${q.url} ${ok ? 200 : 401}`);
    q.on('close', () => closed.push(q.url ?? ''));
    if (q.url === '/stream') {
      s.writeHead(200, { 'content-type': 'text/plain' });
      s.write('first chunk');
      return; // 流式响应，一直不结束
    }
    s.writeHead(ok ? 200 : 401, {
      'set-cookie': ['dsh-auth-abc=v1.x.y; Path=/', 'other=1; Path=/'],
    });
    s.end(ok ? 'ok' : 'no');
  });
  const port = await listen(server);
  return { server, port, hits, closed };
}

function get(port: number, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string; cookies: string[] }>((resolve, reject) => {
    const r = httpRequest({ host: '127.0.0.1', port, path, headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body, cookies: res.headers['set-cookie'] ?? [] }),
      );
    });
    r.on('error', reject);
    r.end();
  });
}

describe('局域网入口', () => {
  let upstream: Upstream;
  let rt: Runtime;
  let gw: ReturnType<typeof createGateway>;
  let port: number;
  beforeEach(async () => {
    const store = new SettingsStore();
    store.update({
      passwordHash: hashPassword('correct-horse-battery', makeSalt()),
      whitelist: [{ id: 'me', name: '本机', value: '127.0.0.1' }],
      whitelistBypassPassword: true,
      allowLoopback: false,
    });
    upstream = await startUpstream(() => rt);
    rt = makeRt(store, upstream.port);
    gw = createGateway(rt);
    port = await freePort();
    await gw.start('127.0.0.1', port);
  });
  afterEach(async () => {
    await gw.stop();
    await new Promise<void>((r) => upstream.server.close(() => r()));
  });

  it('Given 本机免登录关着、设备在列表里且开了免密，When 经入口打开 dsh，Then 主服务放行（原来会 401）', async () => {
    const r = await get(port, '/x');
    expect(r.status).toBe(200);
    expect(upstream.hits).toEqual(['/x 200']);
  });

  it('Given 换个路径写法（/./、%2e）去打插件自己的接口，Then 入口不转发给主服务', async () => {
    for (const path of [
      '/api/remote-access/./login',
      '/api/remote-access/%2e/login',
      '/api/remote-access/settings',
    ]) {
      const r = await get(port, path);
      expect(r.status).not.toBe(200);
    }
    expect(upstream.hits).toEqual([]);
  });

  it('Given dsh 回的响应里带 dsh 原生通行证，Then 不发给局域网设备，别的 cookie 照发', async () => {
    const r = await get(port, '/x');
    expect(r.cookies.some((c) => c.startsWith('dsh-auth-'))).toBe(false);
    expect(r.cookies.some((c) => c.startsWith('other='))).toBe(true);
  });

  it('Given 流式响应进行中，When 局域网那一端断开，Then 通往 dsh 的那半条也断开', async () => {
    const sock = connect(port, '127.0.0.1');
    sock.write(`GET /stream HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
    await vi.waitFor(() => expect(upstream.hits).toContain('/stream 200'));
    sock.destroy();
    await vi.waitFor(() => expect(upstream.closed).toContain('/stream'));
  });

  it('Given 请求头先到、请求体晚到，期间这台设备已错满 5 次，When 请求体到了，Then 直接锁定、不再校验密码', async () => {
    rt.settingsStore.update({ whitelistBypassPassword: false });
    const post = (body: string) =>
      new Promise<number>((resolve) => {
        const r = httpRequest(
          {
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: '/api/remote-access/login',
            headers: { 'content-type': 'application/json' },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        r.end(body);
      });
    const slow = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/api/remote-access/login',
      headers: { 'content-type': 'application/json' },
    });
    const slowStatus = new Promise<number>((resolve) =>
      slow.on('response', (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }),
    );
    slow.flushHeaders();
    for (let i = 0; i < LOGIN_LIMITS.maxFailuresPerIp; i++)
      await post(JSON.stringify({ password: `wrong-${i}` }));
    slow.end(JSON.stringify({ password: 'correct-horse-battery' }));
    expect(await slowStatus).toBe(429);
  });
});
