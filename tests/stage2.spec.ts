import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, connect, type Server, type Socket } from 'node:net';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { effectiveLanPort } from '../src/settings.ts';
import { createGateway } from '../src/gateway.ts';
import { SettingsStore } from '../src/settings-store.ts';
import { SessionManager } from '../src/session-store.ts';
import { createRateLimiter } from '../src/ratelimit.ts';
import { AccessLog } from '../src/access-log.ts';
import { apply } from '../src/index.ts';
import type { Runtime } from '../src/runtime.ts';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { fakeCredentials } from './helpers.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-lan-stage2-'));
  process.env.DSH_REMOTE_ACCESS_FILE = join(dir, 'remote-access.json');
});
afterEach(() => {
  delete process.env.DSH_REMOTE_ACCESS_FILE;
  rmSync(dir, { recursive: true, force: true });
});

/** 系统分一个空闲端口。 */
async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

/** 连上就算成功，连不上（被拒）返回 false。 */
function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const c = connect(port, '127.0.0.1');
    c.once('connect', () => {
      c.destroy();
      resolve(true);
    });
    c.once('error', () => resolve(false));
  });
}

describe('R-009 局域网端口默认值', () => {
  it('Given 没设过端口，Then Desktop 用 19388、Web 用 3081（主端口 + 1）', () => {
    expect(effectiveLanPort({ lanPort: null }, 19387)).toBe(19388);
    expect(effectiveLanPort({ lanPort: null }, 3080)).toBe(3081);
  });
  it('Given 设置文件里的端口正好等于 dsh 主端口（从 Desktop 带过来装到了 Web），Then 退回主端口 + 1，不和 dsh 抢', () => {
    expect(effectiveLanPort({ lanPort: 3080 }, 3080)).toBe(3081);
  });
  it('Given 用户设过别的端口，Then 用用户的', () => {
    expect(effectiveLanPort({ lanPort: 19390 }, 3080)).toBe(19390);
  });
});

describe('R-009 局域网入口即时生效、关闭即断开', () => {
  const runtime = (): Runtime =>
    ({
      settingsStore: new SettingsStore(),
      sessions: new SessionManager({ secret: 's', maxAgeDays: 14 }),
      rateLimiter: createRateLimiter(),
      getCredentials: () => undefined,
      log: new AccessLog(10),
      webServer: { port: 3080 },
      version: '0.1.0',
      profile: 'web',
      lanState: () => ({}),
    }) as unknown as Runtime;

  it('Given 局域网开着，When 把端口从 A 改成 B，Then 不重启 dsh，B 能连、A 连不上', async () => {
    const gw = createGateway(runtime());
    const [a, b] = [await freePort(), await freePort()];
    await gw.start('127.0.0.1', a);
    expect(await canConnect(a)).toBe(true);
    await gw.start('127.0.0.1', b);
    expect(await canConnect(b)).toBe(true);
    expect(await canConnect(a)).toBe(false);
    await gw.stop();
  });

  it('Given B 正连着（长连接），When 关掉局域网入口，Then B 的连接立即被断开', async () => {
    const gw = createGateway(runtime());
    const port = await freePort();
    await gw.start('127.0.0.1', port);
    const sock: Socket = connect(port, '127.0.0.1');
    sock.on('error', () => {}); // 入口关闭时这边会收到连接被重置，属预期
    await new Promise<void>((r) => sock.once('connect', () => r()));
    const closed = new Promise<boolean>((r) => sock.once('close', () => r(true)));
    await gw.stop();
    expect(await Promise.race([closed, new Promise((r) => setTimeout(() => r(false), 1000))])).toBe(
      true,
    );
    expect(await canConnect(port)).toBe(false);
  });
});

describe('R-009 端口被占时开不了，原地说清', () => {
  let blocker: Server;
  let blocked: number;
  beforeEach(async () => {
    blocker = createServer();
    await new Promise<void>((r) => blocker.listen(0, '0.0.0.0', () => r()));
    blocked = (blocker.address() as { port: number }).port;
  });
  afterEach(async () => {
    await new Promise<void>((r) => blocker.close(() => r()));
  });

  it('Given 端口已被别的程序占用，When 打开局域网，Then 开关退回关、返回 port-in-use 和端口号', async () => {
    const routes = new Map<string, WebRoute>();
    const webServer = {
      port: 3080,
      register: (r: WebRoute) => {
        routes.set(r.path, r);
        return () => routes.delete(r.path);
      },
      registerUpgrade: () => () => {},
      registerFallback: () => () => {},
      tapIndex: () => () => {},
    };
    const disposers: Array<() => unknown> = [];
    const ctx = {
      webServer,
      logger: { info() {}, warn() {} },
      get: (key: string) => (key === 'credentials' ? credentials : undefined),
      effect: (fn: () => unknown) => {
        const d = fn();
        if (typeof d === 'function') disposers.push(d as () => unknown);
      },
      on: () => {},
    };
    const credentials = fakeCredentials();
    // 预先存好：已设密码、局域网端口就是被占的那个。
    const store = new SettingsStore();
    store.update({ passwordHash: 'salt:hash', lanPort: blocked });
    apply(ctx as never, {} as never);
    // 启动时的运行检查跑完、局域网才会去开。
    await vi.waitFor(async () => {
      const st = await call(routes.get('/api/remote-access/status')!, undefined, 'GET');
      expect(st.body.checkedAt).not.toBeNull();
    });

    const res = await call(routes.get('/api/remote-access/settings')!, { lanEnabled: true });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'port-in-use', port: blocked });
    expect(new SettingsStore().get().lanEnabled).toBe(false);
    for (const d of disposers.reverse()) await d();
  });
});

/** 以本机身份调用一个管理路由（POST JSON），拿回状态码和 JSON。 */
async function call(
  route: WebRoute,
  body: unknown,
  method = 'POST',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = Readable.from([
    Buffer.from(JSON.stringify(body ?? {})),
  ]) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url: route.path,
    headers: { host: '127.0.0.1:3080', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 0;
  let text = '';
  const done = new Promise<void>((resolve) => {
    const res = {
      writeHead(code: number) {
        status = code;
      },
      end(chunk?: string) {
        text = chunk ?? '';
        resolve();
      },
    } as unknown as ServerResponse;
    void route.handler(req, res);
  });
  await done;
  return { status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}
