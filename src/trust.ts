/**
 * 信任判定纯函数：本机（回环）判定 + IP/CIDR 白名单匹配。
 *
 * 安全核心，全部无副作用、可单测。
 *
 * 本机判定要求「TCP 对端 + Host 头」同时为回环，任一条件单独看都可被绕过：
 * - Host 头可被同网段攻击者伪造（如 `Host: 127.0.0.1`）；
 * - 对端地址可被反向代理顶替（代理在本机连入，真实客户端在远端）。
 * 因此只有两者同时为回环才授予隐式信任，且不采信 X-Forwarded-For 等可伪造头。
 */

import { isIP } from 'node:net';
import { isIpv6, isValidWhitelistValue, parseCidr, parseIpv4 } from './shared.ts';

// 地址校验的实现在 shared.ts（设置页也用同一份），这里转出去给后端用。
export { isIpv6, isValidWhitelistValue, parseCidr };

/** 判断一个地址是否为回环：`::1`、127/8，或双栈套接字上报的 `::ffff:127.x`。 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (v4 === '::1') return true;
  return isIP(v4) === 4 && v4.startsWith('127.');
}

const LOOPBACK_HOST_LITERALS = ['localhost', '[::1]'];

/** 判断一个 `Host` 头是否为回环 authority。 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  if (LOOPBACK_HOST_LITERALS.includes(hostname)) return true;
  return isLoopbackAddress(hostname);
}

/**
 * 请求是否为「本机请求」（回环对端 + 回环 Host）。当 `requireLogin` 为真时，
 * 回环也不再隐式信任。
 */
export function isLocalOrigin(
  remoteAddress: string | undefined,
  hostHeader: string | undefined,
  requireLogin: boolean,
): boolean {
  if (requireLogin) return false;
  return isLoopbackAddress(remoteAddress) && isLoopbackHost(hostHeader);
}

// ── IP / CIDR 白名单匹配 ────────────────────────────────────────────────────

/** 规范化 IP：去空白、去掉 IPv4 映射前缀 `::ffff:`。 */
export function normalizeIp(ip: string): string | undefined {
  if (typeof ip !== 'string') return undefined;
  let s = ip.trim();
  if (s.startsWith('::ffff:')) s = s.slice(7);
  return s === '' ? undefined : s;
}

/** IPv4 或 IPv6 精确相等（规范化 IPv4 映射前缀后比较）。 */
export function ipEquals(a: string, b: string): boolean {
  const na = normalizeIp(a);
  const nb = normalizeIp(b);
  if (na === undefined || nb === undefined) return false;
  return na === nb;
}

/** 判断一个 IP 是否落在某个 CIDR（或精确 IP）范围内。 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const addr = parseIpv4(normalizeIp(ip) ?? '');
  const net = parseCidr(cidr);
  if (addr !== undefined && net !== undefined) {
    return (addr & net.mask) >>> 0 === net.base;
  }
  // 非 IPv4（如 IPv6）退化为精确匹配；IPv6 CIDR 不支持，校验阶段会拒绝。
  return ipEquals(ip, cidr);
}

/** 常见私网/CGNAT 网段（「仅限同网段」模式的近似定义）。 */
const PRIVATE_RANGES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10',
  '169.254.0.0/16',
];

/** 判断一个 IP 是否落在私网/CGNAT 网段。 */
export function isPrivateIp(ip: string): boolean {
  const n = normalizeIp(ip) ?? '';
  if (n === '') return false;
  return PRIVATE_RANGES.some((cidr) => ipInCidr(n, cidr));
}
