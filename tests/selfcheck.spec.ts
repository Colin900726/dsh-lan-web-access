import { describe, it, expect } from 'vitest';
import { compareVersions } from '../src/selfcheck.ts';

describe('compareVersions', () => {
  it('orders numeric components', () => {
    expect(compareVersions('0.2.0', '0.1.7')).toBeGreaterThan(0);
    expect(compareVersions('0.1.7', '0.2.0')).toBeLessThan(0);
    expect(compareVersions('0.2.0', '0.2.0')).toBe(0);
  });
  it('treats prerelease as lower than release', () => {
    expect(compareVersions('0.2.0-rc.2', '0.2.0')).toBeLessThan(0);
    expect(compareVersions('0.2.0', '0.2.0-rc.2')).toBeGreaterThan(0);
  });
  it('orders prerelease identifiers', () => {
    expect(compareVersions('0.2.0-rc.10', '0.2.0-rc.2')).toBeGreaterThan(0);
    expect(compareVersions('0.3.0-rc.1', '0.3.0-0')).toBeGreaterThan(0);
    expect(compareVersions('0.2.9', '0.3.0-0')).toBeLessThan(0);
  });
});
