// 插件刚启动、签名密钥还没读进内存时，Desktop 窗口的第一个请求就带着 dsh 刚签发的 cookie 来了
// （2026-10-07 Desktop 真机踩到：v0.1.2 同步判断时密钥还没读，Desktop 启动被拦）。
// 单独一个文件：模块里的密钥缓存是全局的，要从「什么都没读过」开始。
import { describe, it, expect } from 'vitest';
import type { IncomingMessage } from 'node:http';
import type { WebServer } from '@deepseek-ai/dsh-host-webserver';
import { isAuthorized, isAuthorizedAsync, type GuardDeps } from '../src/guard.ts';
import { SessionManager } from '../src/session-store.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings.ts';
import { issueNativeCookie, type CredentialsLike } from '../src/native-cookie.ts';

const AUTHORITY = '127.0.0.1:19387';
const secret = Buffer.alloc(32, 7);
let reads = 0;
const credentials: CredentialsLike = {
  readRecord: async () => {
    reads++;
    await new Promise((r) => setTimeout(r, 20));
    return { kind: 'grant', payload: { version: 1, secret: secret.toString('base64url') } };
  },
};
const settings: Settings = {
  ...DEFAULT_SETTINGS,
  enabled: true,
  allowLoopback: false,
  passwordHash: 'salt:hash',
  localLoginRequiredSince: Date.now() - 60_000,
};
const deps: GuardDeps = {
  webServer: { port: 19387 } as unknown as WebServer,
  getSettings: () => settings,
  sessions: new SessionManager({ secret: 's', maxAgeDays: 14 }),
  getCredentials: () => credentials,
  logger: { info() {}, warn() {} },
  isPublicRoute: () => false,
};
function req(cookie?: string, host = AUTHORITY, ip = '127.0.0.1') {
  return {
    method: 'GET',
    url: '/',
    headers: cookie === undefined ? { host } : { host, cookie },
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage;
}
const set = (key = secret) => {
  const s = issueNativeCookie(key, AUTHORITY);
  return s.slice(0, s.indexOf(';'));
};

describe('本机免登录关着、密钥还没读进内存', () => {
  it('Given 局域网设备带着 cookie 直连主端口，Then 不放行，也不为它去读密钥', async () => {
    expect(await isAuthorizedAsync(req(set(), '192.168.1.20:19387', '192.168.1.45'), deps)).toBe(
      false,
    );
    expect(reads).toBe(0);
  });

  it('Given 没带 cookie 的本机请求，Then 不放行，也不为它去读密钥', async () => {
    expect(await isAuthorizedAsync(req(), deps)).toBe(false);
    expect(reads).toBe(0);
  });

  it('Given Desktop 窗口第一个请求带着 dsh 签发的 cookie，Then 等密钥读完后放行', async () => {
    expect(isAuthorized(req(set()), deps)).toBe(false); // 同步判断此刻还读不到密钥
    expect(await isAuthorizedAsync(req(set()), deps)).toBe(true);
  });

  it('Given 密钥读到之后签名不对的 cookie，Then 仍不放行', async () => {
    expect(await isAuthorizedAsync(req(set(Buffer.alloc(32, 1))), deps)).toBe(false);
  });
});
