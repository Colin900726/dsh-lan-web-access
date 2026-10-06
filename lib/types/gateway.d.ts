/**
 * 局域网网关（方案 A）：在 `lanHost:lanPort` 监听，白名单 + 密码会话校验通过后，
 * 把请求转发到 `127.0.0.1:<主端口>`，改写 Host 为本机、覆盖注入网关标记与原生
 * cookie，让主服务器把它当「本机请求」。同时转发 WebSocket 升级。
 *
 * 安全边界：网关是局域网路径唯一防线——白名单与会话校验必须在转发之前完成，
 * 任何漏转发都会放进来一个本机身份。敏感管理 API 不经网关转发（主服务器用
 * `x-dsh-remote-gateway` 标记区分，见 admin-api.ts）。
 */
import type { Runtime } from './runtime.ts';
import type { Settings } from './settings.ts';
export interface GatewayHandle {
    /** 按当前设置清理已连着的长连接：被吊销的登录、移出列表的设备、关掉免密后的免密连接。 */
    enforce(revokedSids?: string[]): void;
    /** 在 host:port 上监听；已在别的地址上监听就先关掉再开（改端口 / 网卡即时生效）。 */
    start(host: string, port: number): Promise<void>;
    /** 关掉入口，并立即断开所有已连着的设备（含 WebSocket）。 */
    stop(): Promise<void>;
    readonly listening: boolean;
    readonly address: string | null;
}
export declare function whitelistAllows(ip: string, settings: Settings): boolean;
export declare function createGateway(rt: Runtime): GatewayHandle;
