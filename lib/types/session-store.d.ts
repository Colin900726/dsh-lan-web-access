/**
 * 密码散列（scrypt）+ 可吊销会话（服务端会话表）。
 *
 * 会话 cookie 携带 `{sid, u, e}`（sid 随机、u 用户名、e 过期秒），HMAC-SHA256
 * 签名；服务端保留会话表，支持「踢单个设备」与「改密码全下线」。密码散列与
 * 会话签名密钥均只存 scrypt 散列/随机密钥，不存明文。
 */
import type { ActiveSession } from './settings.ts';
import { MIN_PASSWORD_LENGTH } from './settings.ts';
export { MIN_PASSWORD_LENGTH };
export declare function makeSalt(): string;
export declare function hashPassword(password: string, salt: string): string;
/** 常量时间校验密码散列。 */
export declare function verifyPassword(password: string, storedHash: string): boolean;
export interface SessionPayload {
    sid: string;
    u: string;
    e: number;
}
export declare function makeSessionSecret(): string;
export declare function makeSid(): string;
export declare function signSession(payload: SessionPayload, secret: string): string;
export declare function verifySessionToken(token: string, secret: string): SessionPayload | undefined;
export interface SessionManagerOptions {
    secret: string;
    maxAgeDays: number;
    /** 用于测试的时间源。 */
    now?: () => number;
}
export declare class SessionManager {
    private active;
    private revokeListeners;
    private secret;
    private maxAgeDays;
    private readonly now;
    constructor(opts: SessionManagerOptions);
    /** 登录被吊销时通知（踢下线、全部退出、改密码、移出列表）。返回取消函数。 */
    onRevoke(fn: (sids: string[]) => void): () => void;
    private revoke;
    /** 更新签名密钥（改密码/改用户名时轮换，全部旧会话即刻失效）。 */
    rotateSecret(secret: string): void;
    setMaxAgeDays(days: number): void;
    /** 签发一个新会话，返回 cookie token。 */
    create(username: string, ip: string, userAgent: string): string;
    /** 清理已过期（createdAt + maxAge 超时）的会话条目，避免表无限增长。 */
    private pruneExpired;
    /** 校验会话 token，返回有效载荷（含用户名）。 */
    validate(token: string): {
        sid: string;
        username: string;
    } | undefined;
    /** 踢单个设备下线（sid 为 128 位随机值，复用可忽略，移除即吊销）。 */
    kick(sid: string): boolean;
    /** 全部下线。 */
    kickAll(): void;
    /** 让满足条件的登录全部失效（移出列表时用），返回被吊销的 sid。 */
    kickWhere(pred: (s: ActiveSession) => boolean): string[];
    /** 这个登录还有效吗（没被吊销、没过期）。 */
    has(sid: string): boolean;
    list(): ActiveSession[];
}
