import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { apply } from '../src/index.ts';
import { SettingsStore } from '../src/settings-store.ts';
import { addMintRecord, MAX_MINTED } from '../src/settings.ts';
import { hashPassword, makeSalt } from '../src/session-store.ts';
import { dshVersionInRange } from '../src/selfcheck.ts';
import { checkLatestVersion, runUpdate, UPDATE_SOURCES } from '../src/updater.ts';
import { dshCookie, fakeCredentials, nodeCmd } from './helpers.ts';

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
  cookie?: string,
): Promise<{ status: number; body: Record<string, unknown>; cookies: string[] }> {
  const req = fakeReq(method, body, from.remote, from.host);
  if (cookie !== undefined) (req.headers as Record<string, string>).cookie = cookie;
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

/** 在假 dsh 上装插件，返回路由、connection/request 闸门和卸载函数。profile：desktop / web。 */
function boot(profile?: string) {
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
    get: (key: string) =>
      key === 'credentials'
        ? credentials
        : key === 'profileContext' && profile !== undefined
          ? { name: profile }
          : undefined,
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
    // 这时能看到设置页的浏览器手里都有 dsh 的 cookie（官方 token 登录过）。
    const logs = (
      await call(p.routes.get('/api/remote-access/logs')!, 'GET', undefined, undefined, dshCookie())
    ).body.logs as {
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
    const selfcheck = p.routes.get('/api/remote-access/selfcheck')!;
    // 安全退出时和平时一样：本机免登录开着（默认），本机直接能点「重新检查」。
    const res = await call(selfcheck, 'POST', {});
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

describe('本机免登录关着时，本机管理接口也要登录（用户 2026-10-07 拍板「堵上」）', () => {
  const sensitive: [string, string, unknown][] = [
    ['/api/remote-access/settings', 'POST', { allowLoopback: true }],
    ['/api/remote-access/settings', 'GET', undefined],
    ['/api/remote-access/password', 'POST', { password: 'another-long-password' }],
    ['/api/remote-access/password/clear', 'POST', {}],
    ['/api/remote-access/kick-all', 'POST', {}],
    ['/api/remote-access/devices', 'GET', undefined],
    ['/api/remote-access/logs', 'GET', undefined],
    ['/api/remote-access/update', 'GET', undefined],
  ];
  it('Given 开关关着、本机没登录（开发者工具、命令行），Then 这些接口都回 401 login-required，设置不变', async () => {
    new SettingsStore().update({
      passwordHash: hashPassword('a-long-enough-password', makeSalt()),
      allowLoopback: false,
    });
    const p = boot();
    for (const [path, method, body] of sensitive) {
      const r = await call(p.routes.get(path)!, method, body);
      expect([path, r.status, r.body.code]).toEqual([path, 401, 'login-required']);
    }
    expect(new SettingsStore().get().allowLoopback).toBe(false);
    await p.dispose();
  });
  it('Given 开关关着、本机用密码登录了，Then 能改设置', async () => {
    new SettingsStore().update({
      passwordHash: hashPassword('a-long-enough-password', makeSalt()),
      allowLoopback: false,
    });
    const p = boot();
    const login = await call(p.routes.get('/api/remote-access/login')!, 'POST', {
      password: 'a-long-enough-password',
    });
    const sid = login.cookies.find((c) => c.startsWith('dsh_sid='))!.split(';')[0]!;
    const r = await call(
      p.routes.get('/api/remote-access/settings')!,
      'POST',
      { allowLoopback: true },
      undefined,
      sid,
    );
    expect(r.status).toBe(200);
    expect(new SettingsStore().get().allowLoopback).toBe(true);
    await p.dispose();
  });
  it('Given 总开关关着（回到官方 token 方式），When 本机程序不带任何凭证想把插件重新打开，Then 401', async () => {
    new SettingsStore().update({ enabled: false, allowLoopback: true });
    const p = boot();
    const r = await call(p.routes.get('/api/remote-access/settings')!, 'POST', { enabled: true });
    expect(r.status).toBe(401);
    expect(new SettingsStore().get().enabled).toBe(false);
    await p.dispose();
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
    const settingsRoute = p.routes.get('/api/remote-access/settings')!;
    const changed = await call(settingsRoute, 'POST', { sessionMaxAgeDays: 7 }, undefined, sid);
    expect(changed.status).toBe(200);
    expect(new SettingsStore().get().sessionMaxAgeDays).toBe(7);
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
    expect(await runUpdate('web', '9.9.9')).toMatchObject({ ok: true });
  });
  it('Given 版本号里有命令行特殊字符，Then 回报 bad-arg，不去跑命令', async () => {
    delete process.env.DSH_REMOTE_ACCESS_UPDATE_CMD;
    expect(await runUpdate('web', '9.9.9 && calc')).toMatchObject({ ok: false, reason: 'bad-arg' });
  });
  for (const [profile, hasCommand] of [
    ['web', true],
    ['desktop', false],
  ] as const) {
    it(`Given ${profile} 上更新失败，Then ${hasCommand ? '给终端手动命令' : '不给终端命令（界面指引去「插件」页）'}`, async () => {
      answer = { status: 200, body: { version: '9.9.9' } };
      process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = nodeCmd("console.log('boom');process.exit(1)");
      const p = boot(profile);
      const route = p.routes.get('/api/remote-access/update')!;
      await call(route);
      const failed = (await call(route, 'POST', {})).body;
      expect(failed.state).toBe('failed');
      expect('command' in failed).toBe(hasCommand);
      await p.dispose();
    });
  }
  it('Given 找不到更新命令，Then 回报 no-command（界面给手动命令）', async () => {
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = 'exit 127';
    expect(await runUpdate('web', '9.9.9')).toMatchObject({ ok: false, reason: 'no-command' });
  });
  it('Given 更新命令成功退出、但装上的还是旧版本（如 GitHub 钉了标签、pnpm 冷静期），Then 回报失败，不报完成', async () => {
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = 'exit 0';
    const r = await runUpdate('web', '9.9.9', { verify: true, readInstalled: () => '0.1.2' });
    expect(r).toMatchObject({ ok: false, reason: 'failed' });
    expect(r.output).toContain('装上的版本是 0.1.2，不是 9.9.9');
  });
  it('Given 更新命令成功退出、装上的正是新版本，Then 回报成功', async () => {
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = 'exit 0';
    const r = await runUpdate('web', '9.9.9', { verify: true, readInstalled: () => '9.9.9' });
    expect(r).toMatchObject({ ok: true });
  });
  it('Given npm 官方源和国内镜像都连不上、GitHub 能装上，Then 用 GitHub 装上，回报成功（来源不锁死一种）', async () => {
    const counter = join(dir, 'n');
    // 第 1、2 次（npm、镜像）断网，第 3 次（GitHub）成功
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = nodeCmd(
      "const fs=require('fs');const f=process.argv[1];let n=0;try{n=Number(fs.readFileSync(f,'utf8'))}catch{}" +
        "fs.writeFileSync(f,String(n+1));if(n>=2)process.exit(0);console.log('ECONNRESET');process.exit(1)",
      counter,
    );
    const r = await runUpdate('web', '9.9.9', {
      verify: true,
      readInstalled: () => '9.9.9',
      sources: UPDATE_SOURCES,
    });
    expect(r).toMatchObject({ ok: true });
    expect(readFileSync(counter, 'utf8').trim()).toBe('3');
    expect(r.output).toContain('[GitHub]');
  });
  it('Given 三个来源都断网，Then 回报 network', async () => {
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = nodeCmd("console.log('ECONNRESET');process.exit(1)");
    const r = await runUpdate('web', '9.9.9', { sources: UPDATE_SOURCES });
    expect(r).toMatchObject({ ok: false, reason: 'network' });
  });
  it('Given 更新时断网，Then 回报 network', async () => {
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = nodeCmd(
      "console.log('getaddrinfo ENOTFOUND registry.npmjs.org');process.exit(1)",
    );
    expect(await runUpdate('web', '9.9.9')).toMatchObject({ ok: false, reason: 'network' });
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
  for (const [cmd, reason] of [
    ['exit 127', 'no-command'],
    [nodeCmd("console.log('getaddrinfo ENOTFOUND registry.npmjs.org');process.exit(1)"), 'network'],
    [nodeCmd("console.log('boom');process.exit(1)"), 'failed'],
  ] as const) {
    it(`Given 更新失败（${reason}），Then 状态「失败」带原因和手动命令、记一笔、设置不变，再点能重试`, async () => {
      answer = { status: 200, body: { version: '9.9.9' } };
      process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = cmd;
      new SettingsStore().update({ sessionMaxAgeDays: 7 });
      const p = boot();
      const route = p.routes.get('/api/remote-access/update')!;
      await call(route);
      const failed = (await call(route, 'POST', {})).body;
      expect(failed).toMatchObject({ state: 'failed', reason, latest: '9.9.9' });
      expect(String(failed.command)).toContain('dsh-lan-web-access@9.9.9');
      const logs = (await call(p.routes.get('/api/remote-access/logs')!)).body.logs as {
        kind: string;
        detail: string;
      }[];
      expect(logs.some((e) => e.kind === 'update' && e.detail.startsWith('更新失败'))).toBe(true);
      expect(new SettingsStore().get().sessionMaxAgeDays).toBe(7);
      // 重试：这次成功
      process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = 'exit 0';
      expect((await call(route, 'POST', {})).body).toMatchObject({ state: 'done' });
      await p.dispose();
    });
  }

  it('Given 已是最新，When 直接调更新接口，Then 不更新', async () => {
    answer = { status: 200, body: { version: '0.0.1' } };
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = 'exit 0';
    const p = boot();
    const route = p.routes.get('/api/remote-access/update')!;
    expect((await call(route)).body.state).toBe('latest');
    expect((await call(route, 'POST', {})).body.state).toBe('latest');
    await p.dispose();
  });
});

describe('R-007 版本从哪查、装不上换哪个来源（不锁死一种来源）', () => {
  const servers: Server[] = [];
  const serve = async (status: number, body: unknown): Promise<string> => {
    const s = createServer((_q, r) => {
      r.writeHead(status, { 'content-type': 'application/json' });
      r.end(JSON.stringify(body));
    });
    servers.push(s);
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
    return `http://127.0.0.1:${(s.address() as { port: number }).port}/`;
  };
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  });

  it('Given 两个版本源版本不同（镜像落后），Then 取较高的', async () => {
    process.env.DSH_REMOTE_ACCESS_REGISTRY = `${await serve(200, { version: '0.1.6' })},${await serve(200, { version: '0.1.7' })}`;
    expect(await checkLatestVersion('0.1.5')).toMatchObject({
      state: 'available',
      latest: '0.1.7',
    });
  });
  it('Given 一个版本源连不上、另一个有版本，Then 用查得到的那个', async () => {
    process.env.DSH_REMOTE_ACCESS_REGISTRY = `${await serve(404, {})},${await serve(200, { version: '0.1.7' })}`;
    expect(await checkLatestVersion('0.1.5')).toMatchObject({
      state: 'available',
      latest: '0.1.7',
    });
  });
  it('Given 版本源返回的版本号不规范，Then 当作没查到', async () => {
    process.env.DSH_REMOTE_ACCESS_REGISTRY = await serve(200, { version: '1.0.0 && calc' });
    expect((await checkLatestVersion('0.1.5')).state).toBe('unavailable');
  });
  it('Given npm 官方源命令成功但装上的还是旧版，Then 换下一个来源，装对了就成功', async () => {
    process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = 'exit 0';
    const seen = ['0.1.5', '0.1.7']; // 第一次核对是旧版，第二次是新版
    const r = await runUpdate('web', '0.1.7', {
      verify: true,
      readInstalled: () => seen.shift(),
      sources: UPDATE_SOURCES,
    });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('装上的版本是 0.1.5');
    expect(seen).toHaveLength(0);
  });
});

describe('Desktop 和 Web 同时在跑、共用设置文件', () => {
  it('Given 两个进程各自记下插件签发的 cookie，Then 谁也不会把对方的记录覆盖掉', () => {
    const a = new SettingsStore();
    const b = new SettingsStore();
    const exp = Date.now() + 1e9;
    a.update({ pluginMintedCookies: [{ h: 'from-a', exp }] }, false);
    b.update({ pluginMintedCookies: [{ h: 'from-b', exp }] }, false);
    b.update({ sessionMaxAgeDays: 7 });
    const hashes = new SettingsStore()
      .get()
      .pluginMintedCookies.map((x) => x.h)
      .sort();
    expect(hashes).toEqual(['from-a', 'from-b']);
  });
});

describe('插件签发记录经过设置文件读写，也不超过上限', () => {
  it('Given 连续记 1100 张（上限 1000），Then 文件里最多 1000 条，开始记录的时间挪到被挤掉的之后', () => {
    const store = new SettingsStore();
    const start = Date.now() - 10_000;
    store.update({ mintTrackingSince: start, pluginMintedCookies: [] }, false);
    for (let i = 0; i < 1100; i++)
      store.update(
        addMintRecord(
          store.get(),
          { h: `h${i}`, exp: Date.now() + i + 30 * 86_400_000 },
          Date.now(),
        ),
        false,
      );
    const saved = new SettingsStore().get();
    expect(saved.pluginMintedCookies.length).toBeLessThanOrEqual(MAX_MINTED);
    expect(saved.pluginMintedCookies.some((x) => x.h === 'h1099')).toBe(true);
    expect(saved.pluginMintedCookies.some((x) => x.h === 'h0')).toBe(false);
    expect(saved.mintTrackingSince!).toBeGreaterThan(start);
  });
});

describe('一键更新超时', () => {
  // 靠 macOS / Linux 的进程组和 ps 检查；Windows 走 taskkill，这里不测。
  it.skipIf(process.platform === 'win32')(
    'Given 更新命令卡住（还起了子进程），When 超时，Then 整棵进程树都被杀掉，按网络问题回报',
    async () => {
      const marker = `dsh-upd-timeout-${process.pid}-${Date.now()}`;
      process.env.DSH_REMOTE_ACCESS_UPDATE_CMD = `bash -c 'exec -a ${marker} sleep 60' & wait`;
      const r = await runUpdate('web', '9.9.9', { timeoutMs: 500, sources: ['npm'] });
      expect(r).toMatchObject({ ok: false, reason: 'network' });
      const { execSync } = await import('node:child_process');
      const left = execSync(
        `ps -ax -o command= | grep -c '[${marker[0]}]${marker.slice(1)}' || true`,
      )
        .toString()
        .trim();
      expect(left).toBe('0');
    },
  );
});
