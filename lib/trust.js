/**
 * 判断「是不是本机」和「IP 在不在允许列表里」。
 *
 * 本机要求两条同时成立：连接来自本机地址，且地址栏也是本机。只看一条都能被绕过：
 * Host 头可以伪造；本机上的反向代理会让远端请求看起来来自本机。不信 X-Forwarded-For 这类头。
 */
import { isIP } from 'node:net';
import { isIpv6, isValidWhitelistValue, parseCidr, parseIpv4 } from "./shared.js";
// 地址校验在 shared.ts（前后端共用）。
export { isIpv6, isValidWhitelistValue, parseCidr };
/** 是不是本机地址：`::1`、127.x.x.x、`::ffff:127.x`。 */
export function isLoopbackAddress(address) {
    if (!address)
        return false;
    const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
    if (v4 === '::1')
        return true;
    return isIP(v4) === 4 && v4.startsWith('127.');
}
const LOOPBACK_HOST_LITERALS = ['localhost', '[::1]'];
/** 地址栏是不是本机。 */
export function isLoopbackHost(host) {
    if (!host)
        return false;
    let hostname;
    try {
        hostname = new URL(`http://${host}`).hostname;
    }
    catch {
        return false;
    }
    if (LOOPBACK_HOST_LITERALS.includes(hostname))
        return true;
    return isLoopbackAddress(hostname);
}
/** 是不是本机请求；`requireLogin` 为真时本机也要登录。 */
export function isLocalOrigin(remoteAddress, hostHeader, requireLogin) {
    if (requireLogin)
        return false;
    return isLoopbackAddress(remoteAddress) && isLoopbackHost(hostHeader);
}
// ── 允许列表匹配 ──
/** 去空白、去掉 `::ffff:` 前缀。 */
export function normalizeIp(ip) {
    if (typeof ip !== 'string')
        return undefined;
    let s = ip.trim();
    if (s.startsWith('::ffff:'))
        s = s.slice(7);
    return s === '' ? undefined : s;
}
/** 两个 IP 是否相同。 */
export function ipEquals(a, b) {
    const na = normalizeIp(a);
    const nb = normalizeIp(b);
    if (na === undefined || nb === undefined)
        return false;
    return na === nb;
}
/** IP 是否在某个网段（或就是这个 IP）。 */
export function ipInCidr(ip, cidr) {
    const addr = parseIpv4(normalizeIp(ip) ?? '');
    const net = parseCidr(cidr);
    if (addr !== undefined && net !== undefined) {
        return (addr & net.mask) >>> 0 === net.base;
    }
    // IPv6 只支持单个地址，不支持网段。
    return ipEquals(ip, cidr);
}
/** 常见私网网段（含 Tailscale 用的 100.64/10）。 */
const PRIVATE_RANGES = [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '100.64.0.0/10',
    '169.254.0.0/16',
];
/** IP 是否在私网网段。 */
export function isPrivateIp(ip) {
    const n = normalizeIp(ip) ?? '';
    if (n === '')
        return false;
    return PRIVATE_RANGES.some((cidr) => ipInCidr(n, cidr));
}
