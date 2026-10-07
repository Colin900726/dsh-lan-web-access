/**
 * 请求拦截：给 dsh 的每个路由套一层登录检查，并给通过的请求补上 dsh 自己要的登录 cookie。
 * 公共路由（/login、/api/remote-access/*）不拦。
 */
import type { IncomingMessage } from 'node:http';
import type { WebServer } from '@deepseek-ai/dsh-host-webserver';
import { type CredentialsLike } from './native-cookie.ts';
import type { SessionManager } from './session-store.ts';
import type { Settings } from './settings.ts';
export interface LoggerLike {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
}
export interface GuardDeps {
    webServer: WebServer;
    getSettings: () => Settings;
    sessions: SessionManager;
    getCredentials: () => CredentialsLike | undefined;
    logger: LoggerLike;
    isPublicRoute: (path: string) => boolean;
    /** 运行检查没通过：和关掉总开关一样，交回 dsh 官方认证。 */
    suspended?: () => boolean;
    /** 局域网入口转发时带的令牌（每次启动随机生成）。 */
    gatewayToken?: string;
    /** 记下插件自己签发的 cookie，以后不把它当成 dsh 签发的。 */
    recordPluginMint?: (fingerprint: string, expiresAt: number) => void;
}
/**
 * 请求是否放行：
 * - 主端口只认本机请求，局域网设备必须走局域网入口；
 * - 局域网入口转发来的、本机免登录开着的本机请求、有有效登录的：放行；
 * - 本机免登录关着时，本机还可以用 dsh 官方 token 登录（Desktop 不受这个开关影响）。
 */
export declare function isAuthorized(req: IncomingMessage, deps: GuardDeps): boolean;
/** isAuthorized 的异步版：签名密钥还没读到时（插件刚启动），先等它读完再判一次。 */
export declare function isAuthorizedAsync(req: IncomingMessage, deps: GuardDeps): Promise<boolean>;
/**
 * 本机的管理操作（改设置、改密码等）是否放行。调用前已确认是本机请求。
 * - 插件在接管、本机免登录开着：放行；
 * - 本机免登录关着：要有有效登录，或 dsh 自己签发的 cookie（Desktop 窗口）；
 * - 插件没在接管（总开关关了、安全退出）：按 dsh 官方认证来，要有效登录或签名有效的 dsh cookie，
 *   免得本机任意程序不带 token 就能把插件重新打开。
 */
export declare function adminAllowed(req: IncomingMessage, deps: GuardDeps): Promise<boolean>;
/** 安装守卫，返回撤销函数（插件停用时把改过的东西全部还原）。 */
export declare function installGuard(deps: GuardDeps): () => void;
