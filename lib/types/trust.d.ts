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
import { isIpv6, isValidWhitelistValue, parseCidr } from './shared.ts';
export { isIpv6, isValidWhitelistValue, parseCidr };
/** 判断一个地址是否为回环：`::1`、127/8，或双栈套接字上报的 `::ffff:127.x`。 */
export declare function isLoopbackAddress(address: string | undefined): boolean;
/** 判断一个 `Host` 头是否为回环 authority。 */
export declare function isLoopbackHost(host: string | undefined): boolean;
/**
 * 请求是否为「本机请求」（回环对端 + 回环 Host）。当 `requireLogin` 为真时，
 * 回环也不再隐式信任。
 */
export declare function isLocalOrigin(remoteAddress: string | undefined, hostHeader: string | undefined, requireLogin: boolean): boolean;
/** 规范化 IP：去空白、去掉 IPv4 映射前缀 `::ffff:`。 */
export declare function normalizeIp(ip: string): string | undefined;
/** IPv4 或 IPv6 精确相等（规范化 IPv4 映射前缀后比较）。 */
export declare function ipEquals(a: string, b: string): boolean;
/** 判断一个 IP 是否落在某个 CIDR（或精确 IP）范围内。 */
export declare function ipInCidr(ip: string, cidr: string): boolean;
/** 判断一个 IP 是否落在私网/CGNAT 网段。 */
export declare function isPrivateIp(ip: string): boolean;
