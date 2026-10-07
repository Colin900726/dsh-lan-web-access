/**
 * 登录：主服务和局域网入口共用。
 * 被锁 → 429 + 还要等几秒；密码错 → 401 + 还能错几次；成功 → 发登录 cookie、记访问记录。
 */
import { verifyPassword } from "./session-store.js";
import { sessionCookieSet } from "./cookies.js";
import { jsonResponse, parseJsonBody } from "./admin-api.js";
import { ERROR_CODES } from "./shared.js";
import { computerName } from "./machine-name.js";
import { LOGIN_LIMITS } from "./ratelimit.js";
import { loginPageHtml } from "./login-page.js";
export async function handleLoginPost(rt, req, res, opts) {
    const { rateLimiter, settingsStore, sessions, log } = rt;
    const { ip, exempt } = opts;
    if (req.method !== 'POST') {
        res.writeHead(405);
        res.end();
        return;
    }
    const lockedResponse = () => {
        const retryAfter = rateLimiter.retryAfterSeconds(ip, exempt) ?? LOGIN_LIMITS.lockoutMs / 1000;
        jsonResponse(res, 429, { error: '尝试次数过多', code: ERROR_CODES.locked, retryAfter }, { 'retry-after': String(retryAfter) });
    };
    if (rateLimiter.isBlocked(ip, exempt)) {
        lockedResponse();
        return;
    }
    let body;
    try {
        body = await parseJsonBody(req);
    }
    catch {
        jsonResponse(res, 400, { error: '请求体非法', code: ERROR_CODES.invalidBody });
        return;
    }
    // 读请求体期间别的请求可能已经把次数错满了，校验前再查一次。
    if (rateLimiter.isBlocked(ip, exempt)) {
        lockedResponse();
        return;
    }
    const password = typeof body.password === 'string' ? body.password : '';
    const s = settingsStore.get();
    if (s.passwordHash === null || !verifyPassword(password, s.passwordHash)) {
        rateLimiter.recordFailure(ip);
        log.record('login-failed', ip, '密码错误');
        if (rateLimiter.isBlocked(ip, exempt)) {
            lockedResponse();
            return;
        }
        jsonResponse(res, 401, {
            error: '密码错误',
            code: ERROR_CODES.wrongPassword,
            remaining: exempt ? LOGIN_LIMITS.maxFailuresPerIp : rateLimiter.remaining(ip),
        });
        return;
    }
    rateLimiter.recordSuccess(ip);
    const token = sessions.create('admin', ip, req.headers['user-agent'] ?? '');
    log.record('login', ip, '登录成功');
    const cookies = [
        sessionCookieSet(token, s.sessionMaxAgeDays * 86400),
        ...((await opts.extraCookies?.()) ?? []),
    ];
    jsonResponse(res, 200, { ok: true }, { 'set-cookie': cookies });
}
/** 登录页当前该显示哪一种（被锁时直接显示倒计时）。 */
export function loginView(rt, ip, exempt) {
    const base = {
        host: computerName(),
        days: rt.settingsStore.get().sessionMaxAgeDays,
        maxFailures: LOGIN_LIMITS.maxFailuresPerIp,
        lockSeconds: LOGIN_LIMITS.lockoutMs / 1000,
    };
    if (rt.rateLimiter.isBlocked(ip, exempt))
        return {
            state: 'locked',
            ...base,
            retryAfter: rt.rateLimiter.retryAfterSeconds(ip, exempt) ?? base.lockSeconds,
        };
    return { state: 'login', ...base };
}
export function sendHtml(res, status, html) {
    res.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(html);
}
export { loginPageHtml };
