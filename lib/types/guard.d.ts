/**
 * 请求拦截：路由包装（会话闸门 + 原生 Cookie 补签）+ `connection/request` 权威闸门
 * + index 注入（ownsHost + randomUUID polyfill）。
 *
 * 包装策略：
 * - 回查包装已注册的 exact/prefix/upgrade/fallback，再包装后续注册；
 * - 公共路由（/login、/api/remote-access/*）不包装；
 * - 缺原生 cookie 的授权 GET/HEAD 请求现场补签：文档导航用 200 跳板页，其余用 303。
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
    /** 运行检查没通过、已安全退出：和总开关关掉一样，退回 dsh 官方认证（R-008）。 */
    suspended?: () => boolean;
    /** 局域网入口转发时带的令牌（本进程启动时随机生成，别的进程拿不到）。 */
    gatewayToken?: string;
}
/**
 * 请求是否授权（插件没在接管时一律交给 dsh 自己认证）：
 * - 主服务上只认本机发来的请求。局域网设备必须走局域网入口，不能直连主端口（dsh 绑在 0.0.0.0 时）
 *   凭一个登录绕过允许列表和「局域网访问」开关；
 * - 局域网入口转发来的（带本进程令牌）：入口已经查过允许列表、来源和登录 / 免密，放行；
 * - 本机免登录开着、地址栏也是本机：放行；
 * - 否则要有效登录（本机免登录关着时，本机用密码登录）。
 */
export declare function isAuthorized(req: IncomingMessage, deps: GuardDeps): boolean;
/**
 * 安装守卫，返回撤销函数：撤销 index 注入、还原 webServer 的注册方法、把被包装过的
 * 路由与 fallback 换回原处理器。插件卸载（停用、热重载）时调用，之后可再次安装。
 */
export declare function installGuard(deps: GuardDeps): () => void;
