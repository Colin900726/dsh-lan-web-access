/**
 * 「设备」页的数据：允许列表的每一条，带上它的登录状态；免密设备带最近活跃时间；
 * 再加上不在任何一条里、却登录着的浏览器（「列表为空时允许私有网段」时会有），以及最近被拒的地址。
 * 纯函数，方便测试。
 */
import { ipInCidr, normalizeIp } from "./trust.js";
/** 最近被拒绝的地址最多列几个（用户 2026-10-05 确认：5 个）。 */
export const RECENT_DENIED_LIMIT = 5;
/** 从 User-Agent 认出浏览器和系统，认不出就写「浏览器」「未知系统」。 */
export function describeUserAgent(ua) {
    const browser = /Edg\//.test(ua)
        ? 'Edge'
        : /Firefox\//.test(ua)
            ? 'Firefox'
            : /Chrome\//.test(ua)
                ? 'Chrome'
                : /Safari\//.test(ua)
                    ? 'Safari'
                    : '浏览器';
    const os = /iPad/.test(ua)
        ? 'iPadOS'
        : /iPhone/.test(ua)
            ? 'iOS'
            : /Android/.test(ua)
                ? 'Android'
                : /Mac OS X|Macintosh/.test(ua)
                    ? 'macOS'
                    : /Windows/.test(ua)
                        ? 'Windows'
                        : /Linux/.test(ua)
                            ? 'Linux'
                            : '未知系统';
    return { browser, os };
}
function toDeviceSession(s) {
    return {
        sid: s.sid,
        ip: normalizeIp(s.ip) ?? s.ip,
        ...describeUserAgent(s.userAgent),
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
    };
}
/** 最近被拒绝的地址：按最后一次时间倒序，去重，带次数。 */
export function recentDenied(log, limit = RECENT_DENIED_LIMIT) {
    const byIp = new Map();
    for (const e of log) {
        if (e.kind !== 'whitelist-deny')
            continue;
        const ip = normalizeIp(e.ip) ?? e.ip;
        const hit = byIp.get(ip);
        const n = e.count ?? 1;
        if (hit === undefined)
            byIp.set(ip, { ip, count: n, lastAt: e.ts });
        else {
            hit.count += n;
            hit.lastAt = Math.max(hit.lastAt, e.ts);
        }
    }
    return [...byIp.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, limit);
}
export function buildDevicesView(input) {
    const used = new Set();
    const entries = input.whitelist.map((entry) => {
        const sessions = input.sessions
            .filter((s) => ipInCidr(s.ip, entry.value))
            .map((s) => {
            used.add(s.sid);
            return toDeviceSession(s);
        })
            .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
        let lastSeenAt = null;
        for (const [ip, at] of input.lastSeenByIp) {
            if (ipInCidr(ip, entry.value) && (lastSeenAt === null || at > lastSeenAt))
                lastSeenAt = at;
        }
        return { ...entry, sessions, lastSeenAt };
    });
    const others = input.sessions.filter((s) => !used.has(s.sid)).map(toDeviceSession);
    return {
        entries,
        others,
        bypassPassword: input.bypassPassword,
        emptyMode: input.emptyMode,
        recentDenied: recentDenied(input.log),
    };
}
