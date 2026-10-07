/** 登录限速：同一设备错太多次要等；所有设备总共错太多，等待逐步加长。本机不受限。 */
/** 同一设备连错几次锁定、锁多久（登录页「再错 N 次要等 30 秒」用同一组数）。 */
export const LOGIN_LIMITS = { maxFailuresPerIp: 5, lockoutMs: 30_000 };
export function createRateLimiter(opts = {}) {
    const o = {
        maxFailuresPerIp: LOGIN_LIMITS.maxFailuresPerIp,
        lockoutMs: LOGIN_LIMITS.lockoutMs,
        failureWindowMs: 10 * 60_000,
        globalFreeFailures: 20,
        globalFailuresPerStep: 10,
        globalBackoffBaseMs: 5_000,
        globalBackoffMaxMs: 5 * 60_000,
        globalFailureWindowMs: 60 * 60_000,
        ...opts,
    };
    const perIp = new Map();
    let global;
    let globalLockedUntil = 0;
    function globalBackoffMs(failures) {
        if (failures < o.globalFreeFailures)
            return 0;
        const step = Math.floor((failures - o.globalFreeFailures) / o.globalFailuresPerStep);
        return Math.min(o.globalBackoffMaxMs, o.globalBackoffBaseMs * 2 ** step);
    }
    function prune(now = Date.now()) {
        if (global !== undefined && now - global.firstAt > o.globalFailureWindowMs) {
            global = undefined;
            globalLockedUntil = 0;
        }
        if (perIp.size >= 1024) {
            for (const [ip, entry] of perIp) {
                if (now - entry.firstAt > o.failureWindowMs)
                    perIp.delete(ip);
                else if (entry.lockedUntil !== undefined && entry.lockedUntil < now)
                    perIp.delete(ip);
            }
        }
    }
    function recordFailure(ip, now = Date.now()) {
        if (global === undefined || now - global.firstAt > o.globalFailureWindowMs) {
            global = { count: 1, firstAt: now };
        }
        else {
            global.count += 1;
        }
        const penalty = globalBackoffMs(global.count);
        if (penalty > 0)
            globalLockedUntil = now + penalty;
        if (ip === undefined)
            return;
        const entry = perIp.get(ip);
        if (entry === undefined || now - entry.firstAt > o.failureWindowMs) {
            perIp.set(ip, { count: 1, firstAt: now });
            return;
        }
        entry.count += 1;
        if (entry.count >= o.maxFailuresPerIp)
            entry.lockedUntil = now + o.lockoutMs;
    }
    function recordSuccess(ip) {
        if (ip !== undefined)
            perIp.delete(ip);
        // 一次登录成功不清空全局计数，随时间自然减少。
    }
    function isBlocked(ip, exempt, now = Date.now()) {
        prune(now);
        // 本机不受限，免得被别人刷错次数把自己锁在外面。
        if (exempt)
            return false;
        const local = ip !== undefined && (perIp.get(ip)?.lockedUntil ?? 0) > now;
        if (local)
            return true;
        return globalLockedUntil > now;
    }
    function retryAfterSeconds(ip, exempt, now = Date.now()) {
        if (exempt)
            return undefined;
        const local = ip !== undefined ? (perIp.get(ip)?.lockedUntil ?? 0) : 0;
        const until = Math.max(local, globalLockedUntil);
        if (until <= now)
            return undefined;
        return Math.max(1, Math.ceil((until - now) / 1000));
    }
    /** 这台设备还能错几次才会被锁（窗口外重新算）。 */
    function remaining(ip, now = Date.now()) {
        if (ip === undefined)
            return o.maxFailuresPerIp;
        const entry = perIp.get(ip);
        if (entry === undefined || now - entry.firstAt > o.failureWindowMs)
            return o.maxFailuresPerIp;
        return Math.max(0, o.maxFailuresPerIp - entry.count);
    }
    function reset() {
        perIp.clear();
        global = undefined;
        globalLockedUntil = 0;
    }
    return { recordFailure, recordSuccess, isBlocked, retryAfterSeconds, remaining, reset };
}
