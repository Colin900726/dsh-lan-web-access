/**
 * 管理接口：`/login` 和 `/api/remote-access/*`。
 * 改设置、密码、允许列表、更新、踢下线只限本机；局域网设备走局域网入口自己的登录。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GATEWAY_HEADER, type Edition, type ErrorCode, type RemoteAccessStatus } from './shared.ts';
import type { Runtime } from './runtime.ts';
import type { Settings } from './settings.ts';
export { GATEWAY_HEADER };
export { PACKAGE_NAME } from './updater.ts';
export declare function clientIp(req: IncomingMessage): string;
/** 一块网卡的 IPv4 地址（设置页用来显示访问地址）。 */
export interface LanIpInfo {
    /** 网卡名，如 `en0` / `eth0` / `Wi-Fi`。 */
    name: string;
    /** IPv4 地址。 */
    address: string;
}
/** 本机网卡的 IPv4 地址（不含回环和 169.254）。 */
export declare function listLanIps(): LanIpInfo[];
/**
 * 是不是本机发来的：本机地址、没经过局域网入口，而且是 dsh 自己的页面发的。
 * 后一条防的是本机浏览器里别的网页借机改设置：浏览器带了来源信息就必须和 dsh 同源。
 */
export declare function isLocalRequest(req: IncomingMessage): boolean;
export declare function jsonResponse(res: ServerResponse, status: number, data: object, headers?: Record<string, string | string[]>): void;
export declare function parseJsonBody(req: IncomingMessage, maxBytes?: number): Promise<Record<string, unknown>>;
/** 运行环境：按 dsh profile 名判断是 Desktop 还是 Web。 */
export declare function editionOf(profile: string): Edition;
/** 状态接口的内容：本机多给已登录数和网卡列表，局域网设备多给它自己的 IP。 */
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
/** 校验前端提交的设置改动。 */
export declare function coerceSettingsPatch(body: Record<string, unknown>, current: Settings, mainPort: number): SettingsPatchResult;
/** 注册管理接口，返回撤销函数。 */
export declare function registerAdminApi(rt: Runtime): () => void;
