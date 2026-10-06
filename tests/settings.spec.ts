import { describe, it, expect } from 'vitest';
import {
  normalizeSettings,
  DEFAULT_SETTINGS,
  isValidPort,
  isValidSessionMaxAgeDays,
} from '../src/settings.ts';

describe('normalizeSettings', () => {
  it('falls back to defaults for empty/missing', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null).enabled).toBe(true);
  });
  it('drops malformed whitelist entries and coerces types', () => {
    const s = normalizeSettings({
      whitelist: [
        { id: 'a', name: 'B', value: '192.168.1.20' },
        { id: '', name: '', value: '' },
        { foo: 1 },
      ],
      lanPort: 99999,
      enabled: false,
      sessionMaxAgeDays: 14,
    });
    expect(s.whitelist).toHaveLength(1);
    expect(s.lanPort).toBe(DEFAULT_SETTINGS.lanPort);
    expect(s.enabled).toBe(false);
  });
});

describe('isValidPort', () => {
  it('rejects out-of-range and the main port', () => {
    expect(isValidPort(19388, 19387)).toBe(true);
    expect(isValidPort(19387, 19387)).toBe(false);
    expect(isValidPort(0, 19387)).toBe(false);
    expect(isValidPort(70000, 19387)).toBe(false);
    expect(isValidPort('x', 19387)).toBe(false);
  });
  it('网页版主端口 3080 时，3080 不可用、19387 可用（端口按 dsh 实际读，不写死）', () => {
    expect(isValidPort(3080, 3080)).toBe(false);
    expect(isValidPort(19387, 3080)).toBe(true);
  });
});

describe('isValidSessionMaxAgeDays', () => {
  it('accepts selectable choices only', () => {
    expect(isValidSessionMaxAgeDays(14)).toBe(true);
    expect(isValidSessionMaxAgeDays(5)).toBe(false);
    expect(isValidSessionMaxAgeDays('14')).toBe(false);
  });
});
