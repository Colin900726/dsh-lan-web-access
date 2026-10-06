import { describe, it, expect } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { isLocalRequest } from '../src/admin-api.ts';
import { createRateLimiter } from '../src/ratelimit.ts';
import { SessionManager } from '../src/session-store.ts';

function mockReq(headers: Record<string, string>, ip = '127.0.0.1'): IncomingMessage {
  return { socket: { remoteAddress: ip }, headers } as unknown as IncomingMessage;
}

describe('isLocalRequest（CSRF 防护）', () => {
  it('接受回环 + 回环 Origin 的请求', () => {
    expect(
      isLocalRequest(mockReq({ host: '127.0.0.1:19387', origin: 'http://127.0.0.1:19387' })),
    ).toBe(true);
  });
  it('接受无 Origin 的回环请求（curl）', () => {
    expect(isLocalRequest(mockReq({ host: '127.0.0.1:19387' }))).toBe(true);
  });
  it('拒绝跨站 Origin', () => {
    expect(isLocalRequest(mockReq({ host: '127.0.0.1:19387', origin: 'http://evil.com' }))).toBe(
      false,
    );
  });
  it('拒绝 Origin: null', () => {
    expect(isLocalRequest(mockReq({ host: '127.0.0.1:19387', origin: 'null' }))).toBe(false);
  });
  it('拒绝 Sec-Fetch-Site: cross-site', () => {
    expect(
      isLocalRequest(mockReq({ host: '127.0.0.1:19387', 'sec-fetch-site': 'cross-site' })),
    ).toBe(false);
  });
  it('拒绝非回环对端', () => {
    expect(isLocalRequest(mockReq({ host: '127.0.0.1:19387' }, '192.168.1.5'))).toBe(false);
  });
  it('拒绝网关标记', () => {
    expect(isLocalRequest(mockReq({ host: '127.0.0.1:19387', 'x-dsh-remote-gateway': '1' }))).toBe(
      false,
    );
  });
});

describe('rate limiter（本机豁免）', () => {
  it('exempt 同时豁免每 IP 锁定与全局退避', () => {
    const rl = createRateLimiter({ lockoutMs: 30_000, globalFreeFailures: 20 });
    for (let i = 0; i < 30; i += 1) rl.recordFailure('9.9.9.9');
    expect(rl.isBlocked('9.9.9.9', false)).toBe(true);
    expect(rl.isBlocked('9.9.9.9', true)).toBe(false);
    expect(rl.retryAfterSeconds('9.9.9.9', true)).toBeUndefined();
  });
});

describe('SessionManager（过期清理）', () => {
  it('list() 清理已过期会话', () => {
    let now = 1_000_000;
    const sm = new SessionManager({ secret: 's1', maxAgeDays: 1, now: () => now });
    sm.create('admin', '1.1.1.1', '');
    expect(sm.list()).toHaveLength(1);
    now += 2 * 86400 * 1000;
    expect(sm.list()).toHaveLength(0);
  });
});
