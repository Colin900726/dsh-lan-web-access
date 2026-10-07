/**
 * 判断「是不是本机」和「IP 在不在允许列表里」。
 *
 * 本机要求两条同时成立：连接来自本机地址，且地址栏也是本机。只看一条都能被绕过：
 * Host 头可以伪造；本机上的反向代理会让远端请求看起来来自本机。不信 X-Forwarded-For 这类头。
 */
import { isIpv6, isValidWhitelistValue, parseCidr } from './shared.ts';
export { isIpv6, isValidWhitelistValue, parseCidr };
/** 是不是本机地址：`::1`、127.x.x.x、`::ffff:127.x`。 */
export declare function isLoopbackAddress(address: string | undefined): boolean;
/** 地址栏是不是本机。 */
export declare function isLoopbackHost(host: string | undefined): boolean;
/** 是不是本机请求；`requireLogin` 为真时本机也要登录。 */
export declare function isLocalOrigin(remoteAddress: string | undefined, hostHeader: string | undefined, requireLogin: boolean): boolean;
/** 去空白、去掉 `::ffff:` 前缀。 */
export declare function normalizeIp(ip: string): string | undefined;
/** 两个 IP 是否相同。 */
export declare function ipEquals(a: string, b: string): boolean;
/** IP 是否在某个网段（或就是这个 IP）。 */
export declare function ipInCidr(ip: string, cidr: string): boolean;
/** IP 是否在私网网段。 */
export declare function isPrivateIp(ip: string): boolean;
