import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { handleLoginPost, loginView } from '../src/login.ts';
import { loginPageHtml } from '../src/login-page.ts';
import { SettingsStore } from '../src/settings-store.ts';
import { SessionManager, hashPassword, makeSalt } from '../src/session-store.ts';
import { LOGIN_LIMITS, createRateLimiter } from '../src/ratelimit.ts';
import { AccessLog } from '../src/access-log.ts';
import type { Runtime } from '../src/runtime.ts';

const PASSWORD = 'correct-horse-battery';
let dir: string;
let server: Server;
let port: number;
let rt: Runtime;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-lan-stage4-'));
  process.env.DSH_REMOTE_ACCESS_FILE = join(dir, 'remote-access.json');
  const store = new SettingsStore();
  store.update({ passwordHash: hashPassword(PASSWORD, makeSalt()), sessionMaxAgeDays: 7 });
  rt = {
    settingsStore: store,
    sessions: new SessionManager({ secret: 's', maxAgeDays: 7 }),
    rateLimiter: createRateLimiter(),
    log: new AccessLog(50),
  } as unknown as Runtime;
  server = createServer(
    (req, res) => void handleLoginPost(rt, req, res, { ip: '192.168.1.45', exempt: false }),
  );
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as { port: number }).port;
});
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  delete process.env.DSH_REMOTE_ACCESS_FILE;
  rmSync(dir, { recursive: true, force: true });
});

function login(password: string) {
  return new Promise<{ status: number; body: Record<string, unknown>; cookie: string[] }>(
    (resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/',
          headers: { 'content-type': 'application/json' },
        },
        (res) => {
          let text = '';
          res.on('data', (c) => (text += c));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              body: JSON.parse(text) as Record<string, unknown>,
              cookie: res.headers['set-cookie'] ?? [],
            }),
          );
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify({ password }));
    },
  );
}

describe('R-021 / R-014 登录', () => {
  it('Given 密码不对，Then 401 wrong-password，告诉还能错几次，记一笔「密码错误」', async () => {
    const r = await login('nope');
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({
      code: 'wrong-password',
      remaining: LOGIN_LIMITS.maxFailuresPerIp - 1,
    });
    expect(rt.log.list().at(-1)).toMatchObject({ kind: 'login-failed', ip: '192.168.1.45' });
  });

  it('Given 连错 5 次，Then 第 5 次直接回 429 locked 和要等的秒数，之后对的密码也进不去', async () => {
    for (let i = 0; i < LOGIN_LIMITS.maxFailuresPerIp - 1; i++)
      expect((await login('nope')).status).toBe(401);
    const fifth = await login('nope');
    expect(fifth.status).toBe(429);
    expect(fifth.body.code).toBe('locked');
    expect(fifth.body.retryAfter).toBeGreaterThan(0);
    expect((await login(PASSWORD)).status).toBe(429);
  });

  it('Given 密码对，Then 200、发登录 cookie（有效期按登录保持天数），记一笔「登录成功」', async () => {
    const r = await login(PASSWORD);
    expect(r.status).toBe(200);
    expect(r.cookie.join(';')).toContain(`Max-Age=${7 * 86400}`);
    expect(rt.log.list().at(-1)?.kind).toBe('login');
    expect(rt.sessions.list()).toHaveLength(1);
  });

  it('Given 这个 IP 被锁着，When 打开登录页，Then 直接显示锁定卡和剩余秒数', async () => {
    for (let i = 0; i < LOGIN_LIMITS.maxFailuresPerIp; i++) await login('nope');
    const view = loginView(rt, '192.168.1.45', false);
    expect(view.state).toBe('locked');
    const html = loginPageHtml(view);
    expect(html).toMatch(/data-panel="login" hidden/);
    expect(html).toMatch(/lock\(\d+\);/);
  });
});

describe('R-021 登录页四种状态', () => {
  const base = { host: 'Mac mini', days: 14, maxFailures: 5, lockSeconds: 30 };

  it('Given 正常，Then 写出电脑名和「登录后 14 天内不用再输」', () => {
    const html = loginPageHtml({ state: 'login', ...base });
    expect(html).toContain('Mac mini 上的 dsh');
    expect(html).toContain('登录后 14 天内不用再输');
    expect(html).toContain('id="p" type="password"');
  });

  it('Given 不在列表，Then 写出来访设备的 IP 和三步添加方法', () => {
    const html = loginPageHtml({ state: 'deny', host: 'Mac mini', ip: '192.168.1.45' });
    expect(html).toContain('这台设备还没被允许');
    expect(html.match(/192\.168\.1\.45/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/<li>/g)).toHaveLength(3);
  });

  it('Given dsh 还没准备好，Then 显示等待页并 5 秒后自动刷新', () => {
    const html = loginPageHtml({ state: 'busy', host: 'Mac mini' });
    expect(html).toContain('setTimeout(function () { location.reload(); }, 5000)');
  });

  it('Given 电脑名里有 HTML，Then 原样转义，不会被当成标签', () => {
    const html = loginPageHtml({ state: 'login', ...base, host: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});
