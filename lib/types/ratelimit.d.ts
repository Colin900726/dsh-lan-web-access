/** 登录限速：同一设备错太多次要等；所有设备总共错太多，等待逐步加长。本机不受限。 */
export interface RateLimitOptions {
    maxFailuresPerIp?: number;
    lockoutMs?: number;
    failureWindowMs?: number;
    globalFreeFailures?: number;
    globalFailuresPerStep?: number;
    globalBackoffBaseMs?: number;
    globalBackoffMaxMs?: number;
    globalFailureWindowMs?: number;
}
/** 同一设备连错几次锁定、锁多久（登录页「再错 N 次要等 30 秒」用同一组数）。 */
export declare const LOGIN_LIMITS: {
    readonly maxFailuresPerIp: 5;
    readonly lockoutMs: 30000;
};
export declare function createRateLimiter(opts?: RateLimitOptions): {
    recordFailure: (ip: string | undefined, now?: number) => void;
    recordSuccess: (ip: string | undefined) => void;
    isBlocked: (ip: string | undefined, exempt: boolean, now?: number) => boolean;
    retryAfterSeconds: (ip: string | undefined, exempt: boolean, now?: number) => number | undefined;
    remaining: (ip: string | undefined, now?: number) => number;
    reset: () => void;
};
export type RateLimiter = ReturnType<typeof createRateLimiter>;
