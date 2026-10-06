import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStatus, coerceSettingsPatch, editionOf } from '../src/admin-api.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings.ts';
import { SettingsStore } from '../src/settings-store.ts';
import { SessionManager, hashPassword, makeSalt } from '../src/session-store.ts';
import { isLocalOrigin } from '../src/trust.ts';
import { ERROR_CODES } from '../src/shared.ts';
import type { Runtime } from '../src/runtime.ts';

const noPassword: Settings = { ...DEFAULT_SETTINGS, passwordHash: null };
const withPassword: Settings = {
  ...DEFAULT_SETTINGS,
  passwordHash: hashPassword('correct-horse-battery', makeSalt()),
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-lan-stage1-'));
  process.env.DSH_REMOTE_ACCESS_FILE = join(dir, 'remote-access.json');
});
afterEach(() => {
  delete process.env.DSH_REMOTE_ACCESS_FILE;
  rmSync(dir, { recursive: true, force: true });
});

describe('R-001 本机免登录开关', () => {
  it('Given 还没设管理密码，When 去关「本机免登录」，Then 关不掉，返回 password-required', () => {
    const result = coerceSettingsPatch({ allowLoopback: false }, noPassword, 3080);
    expect(result).toMatchObject({ ok: false, code: ERROR_CODES.passwordRequired });
  });

  it('Given 已设密码，When 关「本机免登录」，Then 能关', () => {
    const result = coerceSettingsPatch({ allowLoopback: false }, withPassword, 3080);
    expect(result).toMatchObject({ ok: true, patch: { allowLoopback: false } });
  });

  it('Given 还没设管理密码，When 打开「本机免登录」，Then 照常保存（只拦关闭）', () => {
    const result = coerceSettingsPatch({ allowLoopback: true }, noPassword, 3080);
    expect(result).toEqual({ ok: true, patch: { allowLoopback: true } });
  });
});

describe('R-002 SSH 隧道免密', () => {
  it('Given B 用 ssh -L 把 A 的 dsh 端口转到 B 本地 9387，When 打开 127.0.0.1:9387，Then A 看到的是本机请求（对端回环 + 地址栏回环）', () => {
    // 隧道在 A 端由 sshd 从 127.0.0.1 连进 dsh，Host 头是 B 地址栏里的 127.0.0.1:9387。
    expect(isLocalOrigin('127.0.0.1', '127.0.0.1:9387', false)).toBe(true);
    expect(isLocalOrigin('::1', 'localhost:9387', false)).toBe(true);
  });
});

describe('R-013 总开关', () => {
  it('Given 已设密码、本机免登录关着，When 关总开关再打开，Then 本机免登录、密码、局域网设置原样还在', () => {
    const store = new SettingsStore();
    store.update({
      passwordHash: withPassword.passwordHash,
      allowLoopback: false,
      lanEnabled: true,
      lanPort: 3081,
    });
    const before = { ...store.get() };

    for (const enabled of [false, true]) {
      const r = coerceSettingsPatch({ enabled }, store.get(), 3080);
      if (!r.ok) throw new Error(r.error);
      store.update(r.patch);
    }

    const reread = new SettingsStore().get();
    expect(reread).toEqual(before);
  });
});

describe('R-006 双版本识别', () => {
  it('Given 装在 Web（profile=web），Then 运行环境是 Web', () => {
    expect(editionOf('web')).toBe('web');
  });
  it('Given 装在 Desktop（profile=desktop），Then 运行环境是 Desktop', () => {
    expect(editionOf('desktop')).toBe('desktop');
  });
  it('Given 识别不出 profile，Then 运行环境写未知，不猜', () => {
    expect(editionOf('unknown')).toBe('unknown');
    expect(editionOf('my-profile')).toBe('unknown');
  });
  it('Given Web 主端口 3080，When 把局域网端口设成 3080，Then 拒绝且原因是端口不可用', () => {
    const result = coerceSettingsPatch({ lanPort: 3080 }, withPassword, 3080);
    expect(result).toMatchObject({ ok: false, code: ERROR_CODES.invalidPort });
  });
});

describe('状态接口：主服务和局域网入口用同一份内容，只按「谁在看」增减', () => {
  const runtime = (): Runtime => {
    const settingsStore = new SettingsStore();
    settingsStore.update({ allowLoopback: true });
    const sessions = new SessionManager({ secret: 's', maxAgeDays: 14 });
    sessions.create('admin', '192.168.1.23', 'UA');
    return {
      settingsStore,
      sessions,
      version: '0.1.0',
      profile: 'web',
      checks: [],
      checkedAt: null,
      fault: () => false,
      update: { state: 'idle', current: '0.1.0' },
      lanState: () => ({
        host: '',
        port: 3081,
        portCustom: false,
        listening: false,
        hostMissing: false,
        hintDone: false,
      }),
    } as unknown as Runtime;
  };
  const base = { trusted: false, authenticated: false, port: 3080, clientIp: '192.168.1.23' };

  it('Given 本机打开设置页，Then 有已登录数和网卡列表，没有来访 IP', () => {
    const s = buildStatus(runtime(), { ...base, local: true, trusted: true, withLanIps: true });
    expect(s.loggedIn).toBe(1);
    expect(s.lanIps).toBeDefined();
    expect(s.clientIp).toBeUndefined();
    expect(s.edition).toBe('web');
  });

  it('Given 局域网设备经入口打开设置页，Then 拿得到本机免登录开关和 dsh 版本，拿不到已登录数和网卡列表', () => {
    const s = buildStatus(runtime(), { ...base, local: false, withLanIps: false });
    expect(s.allowLoopback).toBe(true);
    expect('dshVersion' in s).toBe(true);
    expect(s.loggedIn).toBeUndefined();
    expect(s.lanIps).toBeUndefined();
    expect(s.clientIp).toBe('192.168.1.23');
  });
});
