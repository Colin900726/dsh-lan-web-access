/** 插件的登录 cookie（`dsh_sid`）。 */
export const SESSION_COOKIE = 'dsh_sid';
/** 从 Cookie 头里取出指定名字的值。 */
export function parseCookieValue(header, name) {
    if (header === undefined)
        return undefined;
    for (const segment of header.split(';')) {
        const eq = segment.indexOf('=');
        if (eq === -1)
            continue;
        if (segment.slice(0, eq).trim() === name)
            return segment.slice(eq + 1).trim();
    }
    return undefined;
}
export function readSessionToken(req) {
    return parseCookieValue(req.headers.cookie, SESSION_COOKIE);
}
export function sessionCookieSet(token, maxAgeSec) {
    return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
export function sessionCookieClear() {
    return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
