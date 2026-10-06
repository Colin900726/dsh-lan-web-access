import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { apply } from '../src/index.ts';
import { SettingsStore } from '../src/settings-store.ts';
import { hashPassword, makeSalt } from '../src/session-store.ts';
import { dshVersionInRange } from '../src/selfcheck.ts';
import { checkLatestVersion, runUpdate } from '../src/updater.ts';
import { fakeCredentials } from './helpers.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-lan-stage5-'));
  process.env.DSH_REMOTE_ACCESS_FILE = join(dir, 'remote-access.json');
});
afterEach(() => {
  for (const k of [
    'DSH_REMOTE_ACCESS_FILE',
    'DSH_REMOTE_ACCESS_FAKE_FAIL',
    'DSH_REMOTE_ACCESS_REGISTRY',
    'DSH_REMOTE_ACCESS_UPDATE_CMD',
  ])
    delete process.env[k];
  rmSync(dir, { recursive: true, force: true });
});

function fakeReq(method: string, body: unknown, remote: string, host: string): IncomingMessage {
  const req = Readable.from([
    Buffer.from(JSON.stringify(body ?? {})),
  ]) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url: '/',
    headers: { host, 'content-type': 'application/json' },
    socket: { remoteAddress: remote },
  });
  return req;
}

async function call(
  route: WebRoute,
  method = 'GET',
  body?: unknown,
  from: { remote: string; host: string } = { remote: '127.0.0.1', host: '127.0.0.1:3080' },
): Promise<{ status: number; body: Record<string, unknown>; cookies: string[] }> {
  const req = fakeReq(method, body, from.remote, from.host);
  let cookies: string[] = [];
  let status = 0;
  let text = '';
  await new Promise<void>((resolve) => {
    const res = {
      writeHead(code: number, headers?: Record<string, unknown>) {
        status = code;
        const c = headers?.['set-cookie'];
        if (Array.isArray(c)) cookies = c as string[];
      },
      end(chunk?: string) {
        text = chunk ?? '';
        resolve();
      },
    } as unknown as ServerResponse;
    void route.handler(req, res);
  });
  return { status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {}, cookies };
}

async function freePort(): Promise<number> {
  return new Promise((r) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => r(p));
    });
  });
}

/** 在假 dsh 上装插件，返回路由、connection/request 闸门和卸载函数。 */
function boot() {
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
  let gate:
    | ((req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => Promise<void>)
    | undefined;
  const credentials = fakeCredentials();
  const ctx = {
    webServer,
    logger: { info() {}, warn() {} },
    get: (key: string) => (key === 'credentials' ? credentials : undefined),
    effect: (fn: () => unknown) => {
      const d = fn();
      if (typeof d === 'function') disposers.push(d as () => unknown);
    },
    on: (_name: string, fn: typeof gate) => {
      gate = fn;
    },
  };
  apply(ctx as never, {} as never);
  const status = async () => (await call(routes.get('/api/remote-access/status')!)).body;
  /** 一个没登录的局域网请求过闸门：返回是否被放给 dsh 自己处理。 */
  const lanRequestPasses = async (): Promise<boolean> => {
    let passed = false;
    const res = { writeHead() {}, end() {} } as unknown as ServerResponse;
    await gate!(fakeReq('GET', undefined, '192.168.1.45', '192.168.1.20:3080'), res, async () => {
      passed = true;
    });
    return passed;
  };
  const dispose = async () => {
    for (const d of disposers.reverse()) await d();
  };
  return { routes, status, lanRequestPasses, dispose };
}

describe('R-008 / R-015 运行检查与安全退出', () => {
  it('Given dsh 版本超出支持范围，When dsh 启动，Then 第 4 项标黄、安全退出：闸门交给 dsh 官方认证、局域网入口不开、记一笔', async () => {
    process.env.DSH_REMOTE_ACCESS_FAKE_FAIL = 'dshVersion';
    const port = await freePort();
    new SettingsStore().update({
      passwordHash: 'salt:hash',
      lanEnabled: true,
      lanPort: port,
      lanHost: '',
    });
    const p = boot();
    await vi.waitFor(async () => expect((await p.status()).checkedAt).not.toBeNull());
    const st = await p.status();
    expect(st.fault).toBe(true);
    expect(
      (st.checks as { id: string; state: string }[]).find((c) => c.id === 'dshVersion')?.state,
    ).toBe('warn');
    expect((st.lan as { listening: boolean }).listening).toBe(false);
    // 安全退出后插件不再挡请求，由 dsh 自己的 token 认证决定。
    expect(await p.lanRequestPasses()).toBe(true);
    const logs = (await call(p.routes.get('/api/remote-access/logs')!)).body.logs as {
      kind: string;
    }[];
    expect(logs.some((e) => e.kind === 'selfcheck-fail')).toBe(true);
    await p.dispose();
  });

  it('Given 上一条的状态、问题已解决，When 点「重新检查」，Then 检查全过、自动恢复：闸门重新要登录、局域网入口打开', async () => {
    process.env.DSH_REMOTE_ACCESS_FAKE_FAIL = 'dshVersion';
    const port = await freePort();
    new SettingsStore().update({
      passwordHash: 'salt:hash',
      lanEnabled: true,
      lanPort: port,
      lanHost: '',
    });
    const p = boot();
    await vi.waitFor(async () => expect((await p.status()).fault).toBe(true));
    delete process.env.DSH_REMOTE_ACCESS_FAKE_FAIL;
    const res = await call(p.routes.get('/api/remote-access/selfcheck')!, 'POST', {});
    expect(res.body.fault).toBe(false);
    const st = await p.status();
    expect((st.lan as { listening: boolean }).listening).toBe(true);
    expect(await p.lanRequestPasses()).toBe(false);
    await p.dispose();
  });

  it('Given 未设管理密码，Then 第 5 项中性「未设置」，不触发安全退出', async () => {
    const p = boot();
    await vi.waitFor(async () => expect((await p.status()).checkedAt).not.toBeNull());
    const st = await p.status();
    expect(st.fault).toBe(false);
    expect((st.checks as { id: string; state: string }[]).map((c) => c.state)).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
      'idle',
    ]);
    await p.dispose();
  });

  it('Given 启动时没设密码，When 在「安全」里设好密码，Then 不用点「重新检查」，第 5 项就变成通过', async () => {
    const p = boot();
    await vi.waitFor(async () => expect((await p.status()).checkedAt).not.toBeNull());
    const pw = (st: Record<string, unknown>) =>
      (st.checks as { id: string; state: string }[]).find((c) => c.id === 'password')?.state;
    expect(pw(await p.status())).toBe('idle');
    await call(p.routes.get('/api/remote-access/password')!, 'POST', {
      password: 'a-long-enough-password',
    });
    await vi.waitFor(async () => expect(pw(await p.status())).toBe('ok'));
    await call(p.routes.get('/api/remote-access/password/clear')!, 'POST', {});
    await vi.waitFor(async () => expect(pw(await p.status())).toBe('idle'));
    await p.dispose();
  });

  it('Given dsh 版本，Then 0.1.7 – 0.2.x 之内算支持，0.3.0 起不支持', () => {
    expect(dshVersionInRange('0.2.0-rc.2')).toBe(true);
    expect(dshVersionInRange('0.1.7-rc.1')).toBe(true);
    expect(dshVersionInRange('0.2.9')).toBe(true);
    expect(dshVersionInRange('0.3.0-rc.1')).toBe(false);
    expect(dshVersionInRange('0.1.6')).toBe(false);
  });
});

describe('最终复核：本机登录与主端口', () => {
  it('Given 本机免登录关着、本机用密码登录了，When 改任意设置，Then 本机的登录还在（原来会被当成不在列表里踢掉）', async () => {
    new SettingsStore().update({
      passwordHash: hashPassword('a-long-enough-password', makeSalt()),
      allowLoopback: false,
    });
    const p = boot();
    await vi.waitFor(async () => expect((await p.status()).checkedAt).not.toBeNull());
    const login = await call(p.routes.get('/api/remote-access/login')!, 'POST', {
      password: 'a-long-enough-password',
    });
    expect(login.status).toBe(200);
    const sid = login.cookies.find((c) => c.startsWith('dsh_sid='))!.split(';')[0]!;
    expect(sid).toBeTruthy();
    await call(p.routes.get('/api/remote-access/settings')!, 'POST', { sessionMaxAgeDays: 7 });
    const st = await new Promise<Record<string, unknown>>((resolve) => {
      const req = fakeReq('GET', undefined, '127.0.0.1', '127.0.0.1:3080');
      (req.headers as Record<string, string>).cookie = sid;
      const res = {
        writeHead() {},
        end(chunk?: string) {
          resolve(JSON.parse(chunk ?? '{}') as Record<string, unknown>);
        },
      } as unknown as ServerResponse;
      void p.routes.get('/api/remote-access/status')!.handler(req, res);
    });
    expect(st.authenticated).toBe(true);
    await p.dispose();
  });

  it('Given dsh 绑在 0.0.0.0，When 局域网设备直连主端口登录，Then 拒绝（局域网一律走局域网入口）', async () => {
    new SettingsStore().update({
      passwordHash: hashPassword('a-long-enough-password', makeSalt()),
    });
    const p = boot();
    const r = await call(
      p.routes.get('/api/remote-access/login')!,
      'POST',
      { password: 'a-long-enough-password' },
      { remote: '192.168.1.45', host: '192.168.1.20:3080' },
    );
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('local-only');
    await p.dispose();
  });
});

describe('R-007 一键更新', () => {
  let registry: Server;
  let answer: { status: number; body: unknown };
  beforeEach(async () => {
    registry = createServer((_req, res) => {
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
    await new Promise<void>((r) => registry.listen(0, '127.0.0.1', () => r()));
    process.env.DSH_REMOTE_ACCESS_REGISTRY = `http://127.0.0.1:${(registry.address() as { port: number }).port}/`;
  });
  afterEach(async () => {
    await new Promise<void>((r) => registry.close(() => r()));
  });

  it('Given 版本源上有更高版本，Then「有新版本 x.x.x」', async () => {
    answer = { status: 200, body: { version: '0.1.1' } };
    expect(await checkLatestVersion('0.1.0')).toEqual({
      state: 'available',
      current: '0.1.0',
      latest: '0.1.1',
    });
  });
  it('Given 版本源上是同一版本，Then「已是最新」', async () => {
    answer = { status: 200, body: { version: '0.1.0' } };
    expect((await checkLatestVersion('0.1.0')).state).toBe('latest');
  });
  it('Given 还没发布（版本源 404），Then「暂时查不到新版本」，不算错', async () => {
    answer = { status: 404, body: { error: 'Not found' } };
    expect((await checkLatestVersion('0.1.0')).state).toBe('unavailable');
  });
  it('Given 更新命令成功，Then 回报成功', async () => {
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = 'exit 0';
    expect(await runUpdate('web')).toMatchObject({ ok: true });
  });
  it('Given 找不到更新命令，Then 回报 no-command（界面给手动命令）', async () => {
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = 'exit 127';
    expect(await runUpdate('web')).toMatchObject({ ok: false, reason: 'no-command' });
  });
  it('Given 更新时断网，Then 回报 network', async () => {
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD =
      'echo getaddrinfo ENOTFOUND registry.npmjs.org; exit 1';
    expect(await runUpdate('web')).toMatchObject({ ok: false, reason: 'network' });
  });
  it('Given 打开「关于」有新版本，When 点更新，Then 状态变「完成」、设置不变、记一笔插件更新', async () => {
    answer = { status: 200, body: { version: '9.9.9' } };
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = 'exit 0';
    new SettingsStore().update({ sessionMaxAgeDays: 7 });
    const p = boot();
    const route = p.routes.get('/api/remote-access/update')!;
    expect((await call(route)).body).toMatchObject({ state: 'available', latest: '9.9.9' });
    expect((await call(route, 'POST', {})).body).toMatchObject({ state: 'done', latest: '9.9.9' });
    // 再打开「关于」看到的仍是这次的结果，不会又变回「有新版本」。
    expect((await call(route)).body.state).toBe('done');
    expect(new SettingsStore().get().sessionMaxAgeDays).toBe(7);
    const logs = (await call(p.routes.get('/api/remote-access/logs')!)).body.logs as {
      kind: string;
    }[];
    expect(logs.some((e) => e.kind === 'update')).toBe(true);
    await p.dispose();
  });
});
