import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { createServer, type Socket } from 'node:net';
import { checkSameOrigin, isAllowedHostName } from '../src/origin-guard.ts';
import { buildDevicesView, describeUserAgent, recentDenied } from '../src/devices.ts';
import { createGateway, whitelistAllows } from '../src/gateway.ts';
import { SettingsStore } from '../src/settings-store.ts';
import { SessionManager } from '../src/session-store.ts';
import { createRateLimiter } from '../src/ratelimit.ts';
import { AccessLog } from '../src/access-log.ts';
import { DEFAULT_SETTINGS, type AccessLogEntry } from '../src/settings.ts';
import type { Runtime } from '../src/runtime.ts';
import { fakeCredentials } from './helpers.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-lan-stage3-'));
  process.env.DSH_REMOTE_ACCESS_FILE = join(dir, 'remote-access.json');
});
afterEach(() => {
  delete process.env.DSH_REMOTE_ACCESS_FILE;
  rmSync(dir, { recursive: true, force: true });
});

const H = (headers: Record<string, string>, method = 'GET') => ({ method, headers });

describe('R-017 来源检查（修跨站漏洞）', () => {
  it('Given 入口自己的页面发的请求（Origin 与地址栏一致），Then 放行', () => {
    expect(
      checkSameOrigin(
        H(
          {
            host: '192.168.1.20:3081',
            origin: 'http://192.168.1.20:3081',
            'sec-fetch-site': 'same-origin',
          },
          'POST',
        ),
      ).ok,
    ).toBe(true);
  });
  it('Given 别的网站借 B 的浏览器向入口发 POST，Then 拒绝', () => {
    expect(
      checkSameOrigin(
        H(
          {
            host: '192.168.1.20:3081',
            origin: 'https://evil.example',
            'sec-fetch-site': 'cross-site',
          },
          'POST',
        ),
      ),
    ).toEqual({ ok: false, reason: 'origin' });
  });
  it('Given 别的网站发 WebSocket 握手，Then 拒绝', () => {
    expect(
      checkSameOrigin(H({ host: '192.168.1.20:3081', origin: 'https://evil.example' }), {
        upgrade: true,
      }).ok,
    ).toBe(false);
  });
  it('Given 跨站但不带 Origin 的子请求（如 <img>），Then 拒绝', () => {
    expect(
      checkSameOrigin(
        H({
          host: '192.168.1.20:3081',
          'sec-fetch-site': 'cross-site',
          'sec-fetch-mode': 'no-cors',
        }),
      ).ok,
    ).toBe(false);
  });
  it('Given 从别的网站点链接打开入口页面（GET 文档导航），Then 放行（对方拿不到页面内容）', () => {
    expect(
      checkSameOrigin(
        H({
          host: '192.168.1.20:3081',
          'sec-fetch-site': 'cross-site',
          'sec-fetch-mode': 'navigate',
        }),
      ).ok,
    ).toBe(true);
  });
  it('Given DNS 重绑定（地址栏是攻击者的域名，解析到局域网 IP），Then 拒绝', () => {
    expect(isAllowedHostName('evil.example:3081')).toBe(false);
    expect(
      checkSameOrigin(H({ host: 'evil.example:3081', origin: 'http://evil.example:3081' })).ok,
    ).toBe(false);
  });
  it('Given 地址栏是 IP、本机名.local、Tailscale 的 .ts.net，Then 认', () => {
    expect(isAllowedHostName('192.168.1.20:3081')).toBe(true);
    expect(isAllowedHostName('[fe80::1]:3081')).toBe(true);
    expect(isAllowedHostName('mac-mini.local:3081', 'Mac-mini')).toBe(true);
    expect(isAllowedHostName('mac-mini:3081', 'Mac-mini')).toBe(true);
    expect(isAllowedHostName('macmini.tail1234.ts.net:3081')).toBe(true);
  });
  it('Given curl 这类不带浏览器标记的请求，Then 放行（不会替别人携带 cookie）', () => {
    expect(checkSameOrigin(H({ host: '192.168.1.20:3081' }, 'POST')).ok).toBe(true);
  });
});

describe('R-017 真入口：开着免密，别的网站的请求在转发前就被挡下', () => {
  it('Given 免密打开、本机在列表里，When 带别的网站 Origin 发 POST，Then 403 cross-site 且没有转发到 dsh', async () => {
    const store = new SettingsStore();
    store.update({
      whitelist: [{ id: 'me', name: '本机', value: '127.0.0.1' }],
      whitelistBypassPassword: true,
    });
    let forwarded = 0;
    const dsh = createServer(() => forwarded++);
    await new Promise<void>((r) => dsh.listen(0, '127.0.0.1', () => r()));
    const rt = {
      settingsStore: store,
      sessions: new SessionManager({ secret: 's', maxAgeDays: 14 }),
      rateLimiter: createRateLimiter(),
      getCredentials: () => undefined,
      log: new AccessLog(10),
      webServer: { port: (dsh.address() as { port: number }).port },
      version: '0.1.0',
      profile: 'web',
      lastSeenByIp: new Map(),
      lanState: () => ({}),
    } as unknown as Runtime;
    const gw = createGateway(rt);
    const port = (await new Promise<number>((r) => {
      const s = createServer();
      s.listen(0, '127.0.0.1', () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => r(p));
      });
    })) as number;
    await gw.start('127.0.0.1', port);
    const status = await new Promise<number>((resolve) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/api/rpc',
          headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.end('{}');
    });
    expect(status).toBe(403);
    expect(forwarded).toBe(0);
    expect(rt.log.list().some((e) => e.kind === 'cross-site')).toBe(true);
    await gw.stop();
    await new Promise<void>((r) => dsh.close(() => r()));
  });
});

describe('R-019 / R-011 设备表', () => {
  const now = Date.now();
  const mbpUa =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

  it('Given 两台设备在列表里、一台登录着，Then 登录挂在对应那一行，带浏览器和系统', () => {
    const view = buildDevicesView({
      whitelist: [
        { id: 'a', name: 'MacBook Pro', value: '192.168.1.23' },
        { id: 'b', name: '办公室网段', value: '10.8.0.0/24' },
      ],
      sessions: [
        {
          sid: 's1',
          username: 'admin',
          ip: '::ffff:192.168.1.23',
          userAgent: mbpUa,
          createdAt: now,
          lastSeenAt: now,
        },
      ],
      lastSeenByIp: new Map(),
      bypassPassword: false,
      emptyMode: 'deny-all',
      log: [],
    });
    expect(view.entries[0].sessions).toHaveLength(1);
    expect(view.entries[0].sessions[0]).toMatchObject({
      browser: 'Safari',
      os: 'macOS',
      ip: '192.168.1.23',
    });
    expect(view.entries[1].sessions).toHaveLength(0);
    expect(view.others).toHaveLength(0);
  });

  it('Given 网段里的两台登录着，Then 都挂在网段那一行', () => {
    const view = buildDevicesView({
      whitelist: [{ id: 'b', name: '办公室网段', value: '10.8.0.0/24' }],
      sessions: [
        {
          sid: 's1',
          username: 'admin',
          ip: '10.8.0.14',
          userAgent: '',
          createdAt: now,
          lastSeenAt: now,
        },
        {
          sid: 's2',
          username: 'admin',
          ip: '10.8.0.15',
          userAgent: '',
          createdAt: now,
          lastSeenAt: now - 10,
        },
      ],
      lastSeenByIp: new Map(),
      bypassPassword: false,
      emptyMode: 'deny-all',
      log: [],
    });
    expect(view.entries[0].sessions.map((s) => s.sid)).toEqual(['s1', 's2']);
  });

  it('Given 免密打开、iPad 来访过，Then 那一行带最近活跃时间', () => {
    const view = buildDevicesView({
      whitelist: [{ id: 'i', name: 'iPad', value: '192.168.1.31' }],
      sessions: [],
      lastSeenByIp: new Map([['192.168.1.31', now]]),
      bypassPassword: true,
      emptyMode: 'deny-all',
      log: [],
    });
    expect(view.entries[0].lastSeenAt).toBe(now);
  });

  it('Given 认不出的浏览器，Then 写「浏览器 · 未知系统」，不猜', () => {
    expect(describeUserAgent('curl/8.0')).toEqual({ browser: '浏览器', os: '未知系统' });
    expect(describeUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1')).toEqual({
      browser: 'Safari',
      os: 'iPadOS',
    });
    expect(
      describeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36 Edg/130'),
    ).toEqual({ browser: 'Edge', os: 'Windows' });
  });
});

describe('R-020 最近被拒绝的地址', () => {
  it('Given C 被拒 3 次、D 被拒 1 次、还有别的事件，Then 只列被拒的，去重、带次数、按最近时间倒序，最多 5 个', () => {
    const log: AccessLogEntry[] = [
      { ts: 1, kind: 'whitelist-deny', ip: '192.168.1.45', detail: '/' },
      { ts: 2, kind: 'login', ip: '192.168.1.23', detail: '' },
      { ts: 3, kind: 'whitelist-deny', ip: '::ffff:192.168.1.45', detail: '/' },
      { ts: 4, kind: 'whitelist-deny', ip: '192.168.1.52', detail: '/' },
      { ts: 5, kind: 'whitelist-deny', ip: '192.168.1.45', detail: '/' },
      ...[60, 61, 62, 63, 64].map((n, i) => ({
        ts: 6 + i,
        kind: 'whitelist-deny' as const,
        ip: `10.0.0.${n}`,
        detail: '/',
      })),
    ];
    const list = recentDenied(log);
    expect(list).toHaveLength(5);
    expect(list[0].ip).toBe('10.0.0.64');
    const all = recentDenied(log, 10);
    expect(all.find((d) => d.ip === '192.168.1.45')).toMatchObject({ count: 3, lastAt: 5 });
  });
});

describe('R-019 / R-011 移出列表、退出登录', () => {
  it('Given B 在列表里且登录着，When 把 B 移出列表，Then B 的登录立刻失效，并通知断开长连接', () => {
    const sessions = new SessionManager({ secret: 's', maxAgeDays: 14 });
    sessions.create('admin', '192.168.1.23', 'UA');
    sessions.create('admin', '192.168.1.31', 'UA');
    const revoked: string[][] = [];
    sessions.onRevoke((sids) => revoked.push(sids));
    const after = {
      ...DEFAULT_SETTINGS,
      whitelist: [{ id: 'i', name: 'iPad', value: '192.168.1.31' }],
    };
    const gone = sessions.kickWhere((s) => !whitelistAllows(s.ip, after));
    expect(gone).toHaveLength(1);
    expect(sessions.list().map((s) => s.ip)).toEqual(['192.168.1.31']);
    expect(revoked).toEqual([gone]);
  });

  it('Given 两台登录着，When 全部退出登录，Then 都失效并一次通知', () => {
    const sessions = new SessionManager({ secret: 's', maxAgeDays: 14 });
    sessions.create('admin', '192.168.1.23', 'UA');
    sessions.create('admin', '192.168.1.31', 'UA');
    const revoked: string[][] = [];
    sessions.onRevoke((sids) => revoked.push(sids));
    sessions.kickAll();
    expect(sessions.list()).toHaveLength(0);
    expect(revoked[0]).toHaveLength(2);
  });
});

describe('局域网入口转发时的 dsh cookie 处理', () => {
  /** 起一个假 dsh（记下收到的 cookie，回一条 dsh cookie 和一条普通 cookie）和一个真入口。 */
  async function setup() {
    const store = new SettingsStore();
    store.update({
      whitelist: [{ id: 'me', name: '本机', value: '127.0.0.1' }],
      whitelistBypassPassword: true,
    });
    const seen: string[] = [];
    const dsh = createHttpServer((req, res) => {
      seen.push(String(req.headers.cookie ?? ''));
      res.writeHead(200, { 'set-cookie': ['dsh-auth-x=from-dsh; Path=/', 'keep=1; Path=/'] });
      res.end('ok');
    });
    const upgradedSockets: Socket[] = [];
    dsh.on('upgrade', (req, socket) => {
      upgradedSockets.push(socket as Socket);
      seen.push(String(req.headers.cookie ?? ''));
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          'Set-Cookie: dsh-auth-x=from-dsh; Path=/\r\nSet-Cookie: keep=1; Path=/\r\n\r\n',
      );
    });
    await new Promise<void>((r) => dsh.listen(0, '127.0.0.1', () => r()));
    const rt = {
      settingsStore: store,
      sessions: new SessionManager({ secret: 's', maxAgeDays: 14 }),
      rateLimiter: createRateLimiter(),
      getCredentials: fakeCredentials,
      log: new AccessLog(10),
      webServer: { port: (dsh.address() as { port: number }).port },
      version: '0.1.0',
      profile: 'web',
      gatewayToken: 'tok',
      lastSeenByIp: new Map(),
      lanState: () => ({}),
    } as unknown as Runtime;
    const gw = createGateway(rt);
    const port = await new Promise<number>((r) => {
      const s = createServer();
      s.listen(0, '127.0.0.1', () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => r(p));
      });
    });
    await gw.start('127.0.0.1', port);
    const close = async () => {
      await gw.stop();
      // 升级后的连接不会自己断，关假 dsh 前先断掉，不然 close 一直等。
      for (const s of upgradedSockets) s.destroy();
      await new Promise<void>((r) => dsh.close(() => r()));
    };
    return { port, seen, close };
  }

  it('Given 设备自己带了一张 dsh cookie，When 转发给 dsh，Then 只剩入口给的那一张，设备的其他 cookie 照带', async () => {
    const { port, seen, close } = await setup();
    const setCookie = await new Promise<string[]>((resolve) => {
      const req = httpRequest(
        { host: '127.0.0.1', port, path: '/x', headers: { cookie: 'dsh-auth-x=junk; other=1' } },
        (res) => {
          res.resume();
          resolve((res.headers['set-cookie'] ?? []) as string[]);
        },
      );
      req.end();
    });
    const sent = seen[0]!.split(';').map((c) => c.trim());
    expect(sent.filter((c) => c.startsWith('dsh-auth-'))).toHaveLength(1);
    expect(sent).not.toContain('dsh-auth-x=junk');
    expect(sent).toContain('other=1');
    // dsh 的 cookie 不发给设备，普通 cookie 照发
    expect(setCookie.some((c) => c.startsWith('dsh-auth-'))).toBe(false);
    expect(setCookie.some((c) => c.startsWith('keep=1'))).toBe(true);
    await close();
  });

  it('Given WebSocket 握手，When dsh 回的 101 里带 dsh cookie，Then 设备收到的 101 里没有它', async () => {
    const { port, close } = await setup();
    const headers = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const req = httpRequest({
        host: '127.0.0.1',
        port,
        path: '/ws',
        headers: { connection: 'Upgrade', upgrade: 'websocket' },
      });
      req.on('upgrade', (res, socket) => {
        socket.destroy();
        resolve(res.headers);
      });
      req.on('response', (res) => reject(new Error(`没升级，状态码 ${res.statusCode}`)));
      req.on('error', reject);
      req.end();
    });
    const cookies = ([] as string[]).concat((headers['set-cookie'] as string[] | undefined) ?? []);
    expect(cookies.some((c) => c.startsWith('dsh-auth-'))).toBe(false);
    expect(cookies.some((c) => c.startsWith('keep=1'))).toBe(true);
    await close();
  });
});
