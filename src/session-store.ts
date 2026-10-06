/**
 * 密码散列（scrypt）+ 可吊销会话（服务端会话表）。
 *
 * 会话 cookie 携带 `{sid, u, e}`（sid 随机、u 用户名、e 过期秒），HMAC-SHA256
 * 签名；服务端保留会话表，支持「踢单个设备」与「改密码全下线」。密码散列与
 * 会话签名密钥均只存 scrypt 散列/随机密钥，不存明文。
 */

import { randomBytes, scryptSync, createHmac, timingSafeEqual } from 'node:crypto';
import type { ActiveSession } from './settings.ts';
import { MIN_PASSWORD_LENGTH, isValidSessionMaxAgeDays } from './settings.ts';

export { MIN_PASSWORD_LENGTH };

// ── 密码散列 ────────────────────────────────────────────────────────────────

export function makeSalt(): string {
  return randomBytes(16).toString('hex');
}

export function hashPassword(password: string, salt: string): string {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

/** 常量时间校验密码散列。 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const idx = storedHash.indexOf(':');
  if (idx === -1) return false;
  const salt = storedHash.slice(0, idx);
  const candidate = hashPassword(password, salt);
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── 会话签名（纯函数）───────────────────────────────────────────────────────

export interface SessionPayload {
  sid: string;
  u: string;
  e: number;
}

export function makeSessionSecret(): string {
  return randomBytes(32).toString('hex');
}

export function makeSid(): string {
  return randomBytes(16).toString('hex');
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `${body}.${sig}`;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function verifySessionToken(token: string, secret: string): SessionPayload | undefined {
  const dot = token.indexOf('.');
  if (dot === -1) return undefined;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  if (!timingSafeEqualHex(expected, sig)) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as Partial<SessionPayload>;
    if (
      typeof payload.sid !== 'string' ||
      typeof payload.u !== 'string' ||
      typeof payload.e !== 'number'
    )
      return undefined;
    if (payload.e < Math.floor(Date.now() / 1000)) return undefined;
    return payload as SessionPayload;
  } catch {
    return undefined;
  }
}

// ── 会话管理器（状态）───────────────────────────────────────────────────────

export interface SessionManagerOptions {
  secret: string;
  maxAgeDays: number;
  /** 用于测试的时间源。 */
  now?: () => number;
}

export class SessionManager {
  private active = new Map<string, ActiveSession>();
  private revokeListeners = new Set<(sids: string[]) => void>();
  private secret: string;
  private maxAgeDays: number;
  private readonly now: () => number;

  constructor(opts: SessionManagerOptions) {
    this.secret = opts.secret;
    this.maxAgeDays = isValidSessionMaxAgeDays(opts.maxAgeDays) ? opts.maxAgeDays : 14;
    this.now = opts.now ?? Date.now;
  }

  /** 登录被吊销时通知（踢下线、全部退出、改密码、移出列表）。返回取消函数。 */
  onRevoke(fn: (sids: string[]) => void): () => void {
    this.revokeListeners.add(fn);
    return () => this.revokeListeners.delete(fn);
  }

  private revoke(sids: string[]): void {
    for (const sid of sids) this.active.delete(sid);
    if (sids.length > 0) for (const fn of this.revokeListeners) fn(sids);
  }

  /** 更新签名密钥（改密码/改用户名时轮换，全部旧会话即刻失效）。 */
  rotateSecret(secret: string): void {
    this.secret = secret;
    this.revoke([...this.active.keys()]);
  }

  setMaxAgeDays(days: number): void {
    if (isValidSessionMaxAgeDays(days)) this.maxAgeDays = days;
  }

  /** 签发一个新会话，返回 cookie token。 */
  create(username: string, ip: string, userAgent: string): string {
    const sid = makeSid();
    const now = this.now();
    this.active.set(sid, { sid, username, ip, userAgent, createdAt: now, lastSeenAt: now });
    return signSession(
      { sid, u: username, e: Math.floor(now / 1000) + this.maxAgeDays * 86400 },
      this.secret,
    );
  }

  /** 清理已过期（createdAt + maxAge 超时）的会话条目，避免表无限增长。 */
  private pruneExpired(): void {
    const now = this.now();
    const maxAgeMs = this.maxAgeDays * 86400 * 1000;
    for (const [sid, entry] of this.active) {
      if (now - entry.createdAt > maxAgeMs) this.active.delete(sid);
    }
  }

  /** 校验会话 token，返回有效载荷（含用户名）。 */
  validate(token: string): { sid: string; username: string } | undefined {
    this.pruneExpired();
    const payload = verifySessionToken(token, this.secret);
    if (payload === undefined) return undefined;
    const entry = this.active.get(payload.sid);
    if (entry === undefined) return undefined;
    entry.lastSeenAt = this.now();
    return { sid: payload.sid, username: payload.u };
  }

  /** 踢单个设备下线（sid 为 128 位随机值，复用可忽略，移除即吊销）。 */
  kick(sid: string): boolean {
    if (!this.active.has(sid)) return false;
    this.revoke([sid]);
    return true;
  }

  /** 全部下线。 */
  kickAll(): void {
    this.revoke([...this.active.keys()]);
  }

  /** 让满足条件的登录全部失效（移出列表时用），返回被吊销的 sid。 */
  kickWhere(pred: (s: ActiveSession) => boolean): string[] {
    const sids = [...this.active.values()].filter(pred).map((s) => s.sid);
    this.revoke(sids);
    return sids;
  }

  /** 这个登录还有效吗（没被吊销、没过期）。 */
  has(sid: string): boolean {
    this.pruneExpired();
    return this.active.has(sid);
  }

  list(): ActiveSession[] {
    this.pruneExpired();
    return [...this.active.values()];
  }
}
