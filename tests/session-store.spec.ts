import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  makeSalt,
  signSession,
  verifySessionToken,
  makeSessionSecret,
  SessionManager,
} from '../src/session-store.ts';

describe('password hashing', () => {
  it('verifies correct password and rejects wrong', () => {
    const hash = hashPassword('correct horse', makeSalt());
    expect(verifyPassword('correct horse', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
    expect(verifyPassword('x', 'malformed')).toBe(false);
  });
});

describe('session tokens', () => {
  const secret = makeSessionSecret();
  it('signs and verifies', () => {
    const token = signSession(
      { sid: 'abc', u: 'admin', e: Math.floor(Date.now() / 1000) + 100 },
      secret,
    );
    expect(verifySessionToken(token, secret)).toEqual({
      sid: 'abc',
      u: 'admin',
      e: expect.any(Number),
    });
  });
  it('rejects tampered and expired tokens', () => {
    const token = signSession(
      { sid: 'abc', u: 'admin', e: Math.floor(Date.now() / 1000) + 100 },
      secret,
    );
    expect(verifySessionToken(`${token}x`, secret)).toBeUndefined();
    const expired = signSession(
      { sid: 'abc', u: 'admin', e: Math.floor(Date.now() / 1000) - 10 },
      secret,
    );
    expect(verifySessionToken(expired, secret)).toBeUndefined();
  });
});

describe('SessionManager', () => {
  it('creates, validates, lists, kicks', () => {
    const sm = new SessionManager({ secret: 's1', maxAgeDays: 14 });
    const token = sm.create('admin', '1.2.3.4', 'UA');
    const payload = sm.validate(token);
    expect(payload?.username).toBe('admin');
    expect(sm.list()).toHaveLength(1);
    expect(sm.kick(payload!.sid)).toBe(true);
    expect(sm.validate(token)).toBeUndefined();
  });
  it('kickAll invalidates all sessions', () => {
    const sm = new SessionManager({ secret: 's1', maxAgeDays: 14 });
    const t1 = sm.create('admin', '1.1.1.1', '');
    const t2 = sm.create('admin', '2.2.2.2', '');
    sm.kickAll();
    expect(sm.validate(t1)).toBeUndefined();
    expect(sm.validate(t2)).toBeUndefined();
  });
  it('rotateSecret invalidates all', () => {
    const sm = new SessionManager({ secret: 's1', maxAgeDays: 14 });
    const t = sm.create('admin', '1.1.1.1', '');
    sm.rotateSecret('s2');
    expect(sm.validate(t)).toBeUndefined();
  });
});
