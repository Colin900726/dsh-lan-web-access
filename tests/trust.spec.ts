import { describe, it, expect } from 'vitest';
import {
  isLoopbackAddress,
  isLoopbackHost,
  isLocalOrigin,
  normalizeIp,
  parseCidr,
  ipInCidr,
  isPrivateIp,
  isValidWhitelistValue,
} from '../src/trust.ts';

describe('isLoopbackAddress', () => {
  it('accepts 127/8 and IPv6 loopback', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('127.255.255.255')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
  });
  it('rejects non-loopback and undefined', () => {
    expect(isLoopbackAddress('192.168.1.5')).toBe(false);
    expect(isLoopbackAddress('::ffff:192.168.1.5')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress('')).toBe(false);
  });
});

describe('isLoopbackHost', () => {
  it('accepts localhost and 127/8', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1:19387')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
  });
  it('rejects non-loopback', () => {
    expect(isLoopbackHost('192.168.1.5:19388')).toBe(false);
    expect(isLoopbackHost(undefined)).toBe(false);
  });
});

describe('isLocalOrigin', () => {
  it('requires both loopback peer and loopback host', () => {
    expect(isLocalOrigin('127.0.0.1', '127.0.0.1:19387', false)).toBe(true);
    expect(isLocalOrigin('192.168.1.5', '127.0.0.1:19387', false)).toBe(false);
    expect(isLocalOrigin('127.0.0.1', '192.168.1.5:19388', false)).toBe(false);
  });
  it('respects requireLoopbackLogin', () => {
    expect(isLocalOrigin('127.0.0.1', '127.0.0.1:19387', true)).toBe(false);
  });
});

describe('CIDR / whitelist', () => {
  it('normalizes IPv4-mapped addresses', () => {
    expect(normalizeIp('::ffff:192.168.1.5')).toBe('192.168.1.5');
    expect(normalizeIp(' 192.168.1.5 ')).toBe('192.168.1.5');
  });
  it('parses CIDR', () => {
    expect(parseCidr('192.168.1.0/24')).toEqual({ base: 0xc0a80100, mask: 0xffffff00 });
    expect(parseCidr('192.168.1.20')).toEqual({ base: 0xc0a80114, mask: 0xffffffff });
    expect(parseCidr('10.0.0.0/8')).toEqual({ base: 0x0a000000, mask: 0xff000000 });
    expect(parseCidr('invalid')).toBeUndefined();
    expect(parseCidr('192.168.1.0/33')).toBeUndefined();
  });
  it('matches IP in CIDR', () => {
    expect(ipInCidr('192.168.1.20', '192.168.1.0/24')).toBe(true);
    expect(ipInCidr('192.168.2.1', '192.168.1.0/24')).toBe(false);
    expect(ipInCidr('192.168.1.20', '192.168.1.20')).toBe(true);
    expect(ipInCidr('100.64.0.5', '100.64.0.0/10')).toBe(true);
    expect(ipInCidr('::ffff:192.168.1.20', '192.168.1.0/24')).toBe(true);
  });
  it('classifies private ranges', () => {
    expect(isPrivateIp('192.168.1.20')).toBe(true);
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
  });
  it('validates whitelist values', () => {
    expect(isValidWhitelistValue('192.168.1.20')).toBe(true);
    expect(isValidWhitelistValue('100.64.0.0/10')).toBe(true);
    expect(isValidWhitelistValue('fe80::1')).toBe(true);
    expect(isValidWhitelistValue('999.1.1.1')).toBe(false);
    expect(isValidWhitelistValue('192.168.1.0/99')).toBe(false);
    expect(isValidWhitelistValue('')).toBe(false);
  });
});
