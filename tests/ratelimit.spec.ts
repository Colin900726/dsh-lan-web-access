import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../src/ratelimit.ts';

describe('rate limiter', () => {
  it('locks out an IP after repeated failures', () => {
    const rl = createRateLimiter({ lockoutMs: 30_000 });
    const ip = '9.9.9.9';
    for (let i = 0; i < 5; i += 1) rl.recordFailure(ip);
    expect(rl.isBlocked(ip, false)).toBe(true);
    expect(rl.retryAfterSeconds(ip, false)).toBeGreaterThan(0);
  });
  it('success resets per-IP lockout', () => {
    const rl = createRateLimiter({ lockoutMs: 30_000 });
    const ip = '9.9.9.9';
    for (let i = 0; i < 5; i += 1) rl.recordFailure(ip);
    rl.recordSuccess(ip);
    expect(rl.isBlocked(ip, false)).toBe(false);
  });
  it('applies global backoff beyond the free allowance', () => {
    const rl = createRateLimiter({
      globalFreeFailures: 20,
      globalBackoffBaseMs: 5000,
      globalBackoffMaxMs: 10000,
    });
    for (let i = 0; i < 25; i += 1) rl.recordFailure(`10.0.0.${i % 200}`);
    expect(rl.isBlocked('10.0.0.250', false)).toBe(true);
  });
  it('exempts global backoff for trusted callers', () => {
    const rl = createRateLimiter({ globalFreeFailures: 20, globalBackoffBaseMs: 5000 });
    for (let i = 0; i < 30; i += 1) rl.recordFailure(`10.0.0.${i % 200}`);
    expect(rl.isBlocked('127.0.0.1', true)).toBe(false);
  });
  it('reset clears state', () => {
    const rl = createRateLimiter({});
    rl.recordFailure('1.1.1.1');
    rl.reset();
    expect(rl.isBlocked('1.1.1.1', false)).toBe(false);
  });
});
