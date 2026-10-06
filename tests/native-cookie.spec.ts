import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import {
  nativeCookieName,
  serializeNativeCookie,
  authorityOf,
  bouncePage,
  isDocumentNavigation,
  NATIVE_COOKIE_PREFIX,
  NATIVE_COOKIE_VERSION,
} from '../src/native-cookie.ts';
import type { IncomingMessage } from 'node:http';

const SECRET = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8'); // 32 bytes

function decode(value: string): {
  version: number;
  authority: string;
  issuedAt: number;
  expiresAt: number;
} {
  const parts = value.split('.');
  expect(parts).toHaveLength(3);
  expect(parts[0]).toBe('v1');
  const sig = parts[2];
  const expected = createHmac('sha256', SECRET).update(parts[1]!).digest().toString('base64url');
  expect(sig).toBe(expected);
  return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as never;
}

describe('nativeCookieName', () => {
  it('matches upstream dsh-auth- + base64url(sha256(authority))', () => {
    const authority = '127.0.0.1:19387';
    const expected =
      NATIVE_COOKIE_PREFIX + createHash('sha256').update(authority).digest().toString('base64url');
    expect(nativeCookieName(authority)).toBe(expected);
  });
});

describe('serializeNativeCookie', () => {
  it('produces byte-accurate v1.<payload>.<hmac> and round-trips', () => {
    const payload = {
      version: NATIVE_COOKIE_VERSION,
      authority: '127.0.0.1:19387',
      issuedAt: 1000,
      expiresAt: 2000,
    };
    const value = serializeNativeCookie(payload, SECRET);
    expect(decode(value)).toEqual(payload);
  });
});

describe('authorityOf', () => {
  it('normalizes host via URL', () => {
    expect(authorityOf({ host: '127.0.0.1:19387' })).toBe('127.0.0.1:19387');
    expect(authorityOf({ host: 'Example.COM' })).toBe('example.com');
    expect(authorityOf({ host: 'example.com:80' })).toBe('example.com');
    expect(authorityOf({ host: undefined })).toBeUndefined();
  });
});

describe('bouncePage', () => {
  it('escapes and navigates back', () => {
    const html = bouncePage('/foo?x=1&y=2');
    expect(html).toContain('location.replace');
    expect(html).toContain('/foo?x=1&amp;y=2');
    expect(html).toContain('meta http-equiv="refresh"');
  });
});

describe('isDocumentNavigation', () => {
  const req = (headers: Record<string, string>): IncomingMessage =>
    ({ headers, method: 'GET' }) as unknown as IncomingMessage;
  it('detects navigation vs fetch', () => {
    expect(isDocumentNavigation(req({ 'sec-fetch-mode': 'navigate' }))).toBe(true);
    expect(isDocumentNavigation(req({ 'sec-fetch-mode': 'nested-navigate' }))).toBe(true);
    expect(isDocumentNavigation(req({ 'sec-fetch-mode': 'cors' }))).toBe(false);
  });
  it('falls back to Accept header', () => {
    expect(isDocumentNavigation(req({ accept: 'text/html' }))).toBe(true);
    expect(isDocumentNavigation(req({ accept: 'application/json' }))).toBe(false);
  });
});
