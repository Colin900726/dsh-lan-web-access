/**
 * 密码散列和登录会话。
 * 登录 cookie 是签过名的 `{sid, u, e}`；服务端另存一张会话表，所以能踢单个设备、改密码全部下线。
 * 密码只存 scrypt 散列。
 */
import { randomBytes, scryptSync, createHmac, timingSafeEqual } from 'node:crypto';
import { MIN_PASSWORD_LENGTH, isValidSessionMaxAgeDays } from "./settings.js";
export { MIN_PASSWORD_LENGTH };
// ── 密码散列 ────────────────────────────────────────────────────────────────
export function makeSalt() {
    return randomBytes(16).toString('hex');
}
export function hashPassword(password, salt) {
    return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
/** 常量时间校验密码散列。 */
export function verifyPassword(password, storedHash) {
    const idx = storedHash.indexOf(':');
    if (idx === -1)
        return false;
    const salt = storedHash.slice(0, idx);
    const candidate = hashPassword(password, salt);
    const a = Buffer.from(candidate, 'utf8');
    const b = Buffer.from(storedHash, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
}
export function makeSessionSecret() {
    return randomBytes(32).toString('hex');
}
export function makeSid() {
    return randomBytes(16).toString('hex');
}
export function signSession(payload, secret) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    return `${body}.${sig}`;
}
function timingSafeEqualHex(a, b) {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    return ba.length === bb.length && timingSafeEqual(ba, bb);
}
export function verifySessionToken(token, secret) {
    const dot = token.indexOf('.');
    if (dot === -1)
        return undefined;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    if (!timingSafeEqualHex(expected, sig))
        return undefined;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (typeof payload.sid !== 'string' ||
            typeof payload.u !== 'string' ||
            typeof payload.e !== 'number')
            return undefined;
        if (payload.e < Math.floor(Date.now() / 1000))
            return undefined;
        return payload;
    }
    catch {
        return undefined;
    }
}
export class SessionManager {
    active = new Map();
    revokeListeners = new Set();
    secret;
    maxAgeDays;
    now;
    constructor(opts) {
        this.secret = opts.secret;
        this.maxAgeDays = isValidSessionMaxAgeDays(opts.maxAgeDays) ? opts.maxAgeDays : 14;
        this.now = opts.now ?? Date.now;
    }
    /** 登录被吊销时通知（踢下线、全部退出、改密码、移出列表）。返回取消函数。 */
    onRevoke(fn) {
        this.revokeListeners.add(fn);
        return () => this.revokeListeners.delete(fn);
    }
    revoke(sids) {
        for (const sid of sids)
            this.active.delete(sid);
        if (sids.length > 0)
            for (const fn of this.revokeListeners)
                fn(sids);
    }
    /** 换签名密钥（改密码时用，旧登录全部失效）。 */
    rotateSecret(secret) {
        this.secret = secret;
        this.revoke([...this.active.keys()]);
    }
    setMaxAgeDays(days) {
        if (isValidSessionMaxAgeDays(days))
            this.maxAgeDays = days;
    }
    /** 签发一个新会话，返回 cookie token。 */
    create(username, ip, userAgent) {
        const sid = makeSid();
        const now = this.now();
        this.active.set(sid, { sid, username, ip, userAgent, createdAt: now, lastSeenAt: now });
        return signSession({ sid, u: username, e: Math.floor(now / 1000) + this.maxAgeDays * 86400 }, this.secret);
    }
    /** 清掉过期的会话。 */
    pruneExpired() {
        const now = this.now();
        const maxAgeMs = this.maxAgeDays * 86400 * 1000;
        for (const [sid, entry] of this.active) {
            if (now - entry.createdAt > maxAgeMs)
                this.active.delete(sid);
        }
    }
    /** 校验会话 token，返回有效载荷（含用户名）。 */
    validate(token) {
        this.pruneExpired();
        const payload = verifySessionToken(token, this.secret);
        if (payload === undefined)
            return undefined;
        const entry = this.active.get(payload.sid);
        if (entry === undefined)
            return undefined;
        entry.lastSeenAt = this.now();
        return { sid: payload.sid, username: payload.u };
    }
    /** 踢一个登录下线。 */
    kick(sid) {
        if (!this.active.has(sid))
            return false;
        this.revoke([sid]);
        return true;
    }
    /** 全部下线。 */
    kickAll() {
        this.revoke([...this.active.keys()]);
    }
    /** 让满足条件的登录全部失效（移出列表时用），返回被吊销的 sid。 */
    kickWhere(pred) {
        const sids = [...this.active.values()].filter(pred).map((s) => s.sid);
        this.revoke(sids);
        return sids;
    }
    /** 这个登录还有效吗（没被吊销、没过期）。 */
    has(sid) {
        this.pruneExpired();
        return this.active.has(sid);
    }
    list() {
        this.pruneExpired();
        return [...this.active.values()];
    }
}
