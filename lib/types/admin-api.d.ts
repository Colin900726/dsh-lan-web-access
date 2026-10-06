/**
 * 管理/认证 API：注册到主 webServer 的 `/login` 与 `/api/remote-access/*`。
 *
 * 敏感操作（改设置/密码/白名单/更新/踢下线）只限「本机」——回环请求且未经
 * 局域网网关（网关会覆盖注入 `x-dsh-remote-gateway: 1` 标记）。登录/退出/状态
 * 供本机（allowLoopback=false）使用；局域网浏览器走网关自己的登录。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GATEWAY_HEADER, type Edition, type ErrorCode, type RemoteAccessStatus } from './shared.ts';
import type { Runtime } from './runtime.ts';
import type { Settings } from './settings.ts';
export { GATEWAY_HEADER };
export { PACKAGE_NAME } from './updater.ts';
export declare function clientIp(req: IncomingMessage): string;
/** 一块网卡的 IPv4 信息，供设置页提示浏览器访问地址。 */
export interface LanIpInfo {
    /** 网卡名，如 `en0` / `eth0` / `Wi-Fi`。 */
    name: string;
    /** IPv4 地址。 */
    address: string;
}
/** 枚举本机网卡的 IPv4 地址（排除回环/内部接口与 169.254 链路本地地址），带网卡名。 */
export declare function listLanIps(): LanIpInfo[];
/**
 * 是否「本机」：回环对端 + 回环 Host、没经过局域网入口，并且是 dsh 自己的页面发来的。
 *
 * 防 CSRF：本机浏览器里别的网页（包括同一台电脑其他端口上的页面——它们和 dsh 算同站不同源）
 * 可以向 127.0.0.1 发「简单请求」改密码、开局域网。所以浏览器带了来源信息就必须完全同源：
 * Origin 等于 `http://{Host}`（含端口），Sec-Fetch-Site 只能是 same-origin / none。
 * 不带这些头的（curl 等非浏览器客户端）不会替别人携带 cookie，放行。POST 体还必须是 JSON（见 parseJsonBody），
 * 跨源的 JSON 请求浏览器一定先预检，预检不会通过。
 */
export declare function isLocalRequest(req: IncomingMessage): boolean;
export declare function jsonResponse(res: ServerResponse, status: number, data: object, headers?: Record<string, string | string[]>): void;
export declare function parseJsonBody(req: IncomingMessage, maxBytes?: number): Promise<Record<string, unknown>>;
/** 运行环境：按 dsh profile 名判断是 Desktop 还是 Web。 */
export declare function editionOf(profile: string): Edition;
/**
 * 组装 `/api/remote-access/status` 的返回内容。主服务和局域网入口都用这一个函数，
 * 两边只差「谁在看」：本机多给已登录数和网卡列表，非本机多给它自己的 IP。
 */
export declare function buildStatus(rt: Runtime, view: {
    local: boolean;
    trusted: boolean;
    authenticated: boolean;
    port: number;
    clientIp: string;
    withLanIps: boolean;
}): RemoteAccessStatus;
export type SettingsPatchResult = {
    ok: true;
    patch: Partial<Settings>;
} | {
    ok: false;
    error: string;
    code: ErrorCode;
};
/** 校验并规范前端提交的设置补丁。 */
export declare function coerceSettingsPatch(body: Record<string, unknown>, current: Settings, mainPort: number): SettingsPatchResult;
/** 注册管理/认证 API，返回撤销函数（插件卸载时移除全部路由，之后可再次注册）。 */
export declare function registerAdminApi(rt: Runtime): () => void;
