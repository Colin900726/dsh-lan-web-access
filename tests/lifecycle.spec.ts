import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver';
import { apply } from '../src/index.ts';

/** 行为对齐 dsh-host-webserver：重复路由抛错、注册返回撤销函数、index 按注册顺序过 tap。 */
class FakeWebServer {
  exact = new Map<string, WebRoute>();
  prefixes = new Map<string, WebRoute>();
  upgrades = new Map<string, WebUpgradeRoute>();
  fallback: WebRoute['handler'] | undefined;
  taps: Array<(html: string) => string> = [];
  port = 3080;
  /** 测试用：下一次 tapIndex 抛错 / 下一次撤销 tap 抛错。 */
  failNextTap = false;
  failNextUntap = false;

  register(route: WebRoute): () => void {
    const table = route.kind === 'prefix' ? this.prefixes : this.exact;
    if (table.has(route.path))
      throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);
    table.set(route.path, route);
    // 与真实实现一致：撤销时无条件删除该路径。
    return () => table.delete(route.path);
  }
  registerUpgrade(route: WebUpgradeRoute): () => void {
    if (this.upgrades.has(route.path))
      throw new Error(`webserver: duplicate upgrade route "${route.path}"`);
    this.upgrades.set(route.path, route);
    return () => this.upgrades.delete(route.path);
  }
  registerFallback(handler: WebRoute['handler']): () => void {
    if (this.fallback !== undefined) throw new Error('webserver: fallback already registered');
    this.fallback = handler;
    return () => {
      this.fallback = undefined;
    };
  }
  tapIndex(transform: (html: string) => string): () => void {
    if (this.failNextTap) {
      this.failNextTap = false;
      throw new Error('tap failed');
    }
    this.taps.push(transform);
    return () => {
      if (this.failNextUntap) {
        this.failNextUntap = false;
        throw new Error('untap failed');
      }
      this.taps = this.taps.filter((t) => t !== transform);
    };
  }
  renderIndex(html: string): string {
    return this.taps.reduce((acc, t) => t(acc), html);
  }
}

/**
 * 模拟 cordis 的服务代理：经 ctx 读到的函数每次都是新包一层的代理（真实 dsh 就是这样），
 * 只有 Symbol.for('cordis.original') 能拿到原对象。
 */
function cordisProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop) {
      if (prop === Symbol.for('cordis.original')) return t;
      const value = Reflect.get(t, prop, t);
      if (typeof value === 'function')
        return new Proxy(value, { apply: (fn, _this, args) => Reflect.apply(fn, t, args) });
      return value;
    },
    set(t, prop, value) {
      return Reflect.set(t, prop, value, t);
    },
    deleteProperty(t, prop) {
      return Reflect.deleteProperty(t, prop);
    },
  });
}

/** 最小的 cordis 上下文：effect / on 收集撤销函数，dispose() 按逆序执行，模拟插件卸载。 */
function fakeContext(webServer: FakeWebServer) {
  const disposers: Array<() => void> = [];
  const listeners = new Map<string, Set<(...args: unknown[]) => unknown>>();
  const ctx = {
    webServer: cordisProxy(webServer),
    logger: { info() {}, warn() {} },
    get: () => undefined,
    effect(fn: () => (() => void) | void) {
      const d = fn();
      if (typeof d === 'function') disposers.push(d);
    },
    on(name: string, fn: (...args: unknown[]) => unknown) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
      disposers.push(() => listeners.get(name)!.delete(fn));
    },
  };
  return {
    ctx,
    listeners,
    dispose() {
      for (const d of disposers.reverse()) d();
      disposers.length = 0;
    },
  };
}

const routeCount = (ws: FakeWebServer): number => ws.exact.size + ws.prefixes.size;

/** 本机发来的一个 API 请求（POST，不触发补签），返回响应体。 */
async function loopbackApiCall(handler: WebRoute['handler']): Promise<string> {
  let body = '';
  const req = {
    method: 'POST',
    url: '/api/x',
    headers: { host: '127.0.0.1:3080' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
  const res = {
    writeHead() {},
    end(chunk?: string) {
      body = chunk ?? '';
    },
  } as unknown as ServerResponse;
  await handler(req, res);
  return body;
}

const ownMethods = (ws: FakeWebServer): string[] =>
  ['register', 'registerUpgrade', 'registerFallback'].filter((k) =>
    Object.prototype.hasOwnProperty.call(ws, k),
  );
const INDEX = '<html><head></head><body></body></html>';
const injectedScripts = (ws: FakeWebServer): number =>
  ws.renderIndex(INDEX).split('ownsHost: true').length - 1;

let dir: string;
let ws: FakeWebServer;
let hostHandler: WebRoute['handler'];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-lan-lifecycle-'));
  process.env.DSH_REMOTE_ACCESS_FILE = join(dir, 'remote-access.json');
  ws = new FakeWebServer();
  // 宿主自己的路由（相当于 dsh 的 /api）和 fallback（相当于 SPA 首页）先于插件注册。
  hostHandler = (_req, res) => {
    res.end('host');
  };
  ws.register({ kind: 'prefix', path: '/api/', handler: hostHandler });
  ws.registerFallback(hostHandler);
});

afterEach(() => {
  delete process.env.DSH_REMOTE_ACCESS_FILE;
  rmSync(dir, { recursive: true, force: true });
});

describe('R-013 插件停用 / 再启用', () => {
  it('Given 插件在运行，When 在 dsh 插件管理里停用再启用，Then 不报错，免登录照常工作，页面注入不重复', async () => {
    const first = fakeContext(ws);
    apply(first.ctx as never, {} as never);
    const routesWhileOn = routeCount(ws);
    expect(injectedScripts(ws)).toBe(1);

    first.dispose();
    expect(() => {
      const second = fakeContext(ws);
      apply(second.ctx as never, {} as never);
    }).not.toThrow();

    expect(routeCount(ws)).toBe(routesWhileOn);
    expect(injectedScripts(ws)).toBe(1);
    const api = ws.prefixes.get('/api/')!.handler;
    expect(api).not.toBe(hostHandler);
    expect(await loopbackApiCall(api)).toBe('host');
  });

  it('Given 插件已停用，Then 不留残留：插件路由、页面注入、请求闸门都撤掉，宿主路由与 fallback 换回原处理器', () => {
    const before = routeCount(ws);
    const plugin = fakeContext(ws);
    apply(plugin.ctx as never, {} as never);
    expect(routeCount(ws)).toBeGreaterThan(before);
    expect(ws.prefixes.get('/api/')!.handler).not.toBe(hostHandler);
    expect(ws.fallback).not.toBe(hostHandler);
    expect(plugin.listeners.get('connection/request')?.size).toBe(1);

    plugin.dispose();

    expect(routeCount(ws)).toBe(before);
    expect(injectedScripts(ws)).toBe(0);
    expect(ws.prefixes.get('/api/')!.handler).toBe(hostHandler);
    expect(ws.fallback).toBe(hostHandler);
    expect(plugin.listeners.get('connection/request')?.size ?? 0).toBe(0);
    expect(ownMethods(ws)).toEqual([]);
  });

  it('Given 插件运行期间宿主新注册了路由、upgrade 和 fallback，When 插件停用，Then 它们都换回原处理器', () => {
    const plugin = fakeContext(ws);
    apply(plugin.ctx as never, {} as never);

    const proxied = plugin.ctx.webServer as unknown as FakeWebServer;
    const during: WebRoute = { kind: 'exact', path: '/during', handler: hostHandler };
    proxied.register(during);
    const upgradeHandler = (_req: IncomingMessage, socket: Duplex) => {
      socket.end();
    };
    const upgrade = { path: '/ws', handler: upgradeHandler } as unknown as WebUpgradeRoute;
    proxied.registerUpgrade(upgrade);
    const releaseHostFallback = () => {
      ws.fallback = undefined;
    };
    releaseHostFallback();
    const lateFallback: WebRoute['handler'] = (_req, res) => {
      res.end('late');
    };
    proxied.registerFallback(lateFallback);
    expect(during.handler).not.toBe(hostHandler);
    expect(upgrade.handler).not.toBe(upgradeHandler);
    expect(ws.fallback).not.toBe(lateFallback);

    plugin.dispose();

    expect(during.handler).toBe(hostHandler);
    expect(upgrade.handler).toBe(upgradeHandler);
    expect(ws.fallback).toBe(lateFallback);
  });

  it('Given 插件停用后宿主又注册了新路由，Then 新路由不再被插件拦截', () => {
    const plugin = fakeContext(ws);
    apply(plugin.ctx as never, {} as never);
    plugin.dispose();

    const late: WebRoute = { kind: 'exact', path: '/late', handler: hostHandler };
    ws.register(late);
    expect(late.handler).toBe(hostHandler);
  });

  it('Given 撤销时某一步抛错，Then 其余还原照做，之后还能重新启用', () => {
    const plugin = fakeContext(ws);
    apply(plugin.ctx as never, {} as never);
    ws.failNextUntap = true;
    plugin.dispose();

    expect(ws.prefixes.get('/api/')!.handler).toBe(hostHandler);
    expect(ws.fallback).toBe(hostHandler);
    expect(ownMethods(ws)).toEqual([]);

    const again = fakeContext(ws);
    apply(again.ctx as never, {} as never);
    expect(ws.prefixes.get('/api/')!.handler).not.toBe(hostHandler);
  });

  it('Given 安装守卫时出错，Then 不留半套守卫，修好后能正常启用', () => {
    const before = routeCount(ws);
    ws.failNextTap = true;
    const broken = fakeContext(ws);
    expect(() => apply(broken.ctx as never, {} as never)).toThrow('tap failed');
    broken.dispose();
    expect(routeCount(ws)).toBe(before);
    expect(ws.prefixes.get('/api/')!.handler).toBe(hostHandler);
    expect(ownMethods(ws)).toEqual([]);

    const plugin = fakeContext(ws);
    expect(() => apply(plugin.ctx as never, {} as never)).not.toThrow();
    expect(injectedScripts(ws)).toBe(1);
  });

  it('Given 管理路由注册到一半撞上已占用的路径，Then 已注册的全部撤掉，路径空出来后能正常启用', () => {
    const occupy = ws.register({
      kind: 'exact',
      path: '/api/remote-access/settings',
      handler: hostHandler,
    });
    const before = routeCount(ws);
    const broken = fakeContext(ws);
    expect(() => apply(broken.ctx as never, {} as never)).toThrow('duplicate');
    broken.dispose();
    expect(routeCount(ws)).toBe(before);

    occupy();
    const plugin = fakeContext(ws);
    expect(() => apply(plugin.ctx as never, {} as never)).not.toThrow();
  });

  it('Given 新实例在旧实例卸载之前就启用了，Then 新实例接管守卫和管理路由，旧实例卸载不影响它', async () => {
    const isAdmin = (p: string): boolean => p === '/login' || p.startsWith('/api/remote-access/');
    const adminRoutes = (): number => [...ws.exact.keys()].filter(isAdmin).length;

    const oldOne = fakeContext(ws);
    apply(oldOne.ctx as never, {} as never);
    const adminCount = adminRoutes();
    expect(adminCount).toBeGreaterThan(0);

    const newOne = fakeContext(ws);
    expect(() => apply(newOne.ctx as never, {} as never)).not.toThrow();
    expect(adminRoutes()).toBe(adminCount);
    expect(injectedScripts(ws)).toBe(1);

    oldOne.dispose();
    expect(adminRoutes()).toBe(adminCount);
    expect(injectedScripts(ws)).toBe(1);
    const api = ws.prefixes.get('/api/')!.handler;
    expect(api).not.toBe(hostHandler);
    expect(await loopbackApiCall(api)).toBe('host');

    newOne.dispose();
    expect(adminRoutes()).toBe(0);
    expect(ws.prefixes.get('/api/')!.handler).toBe(hostHandler);
    expect(injectedScripts(ws)).toBe(0);
    expect(ownMethods(ws)).toEqual([]);
  });

  it('Given 插件运行中 /login 被宿主换成了自己的路由，When 插件停用，Then 宿主那条不被删掉', () => {
    const plugin = fakeContext(ws);
    apply(plugin.ctx as never, {} as never);
    const hostLogin: WebRoute = { kind: 'exact', path: '/login', handler: hostHandler };
    ws.exact.set('/login', hostLogin);

    plugin.dispose();

    expect(ws.exact.get('/login')).toBe(hostLogin);
  });
});
