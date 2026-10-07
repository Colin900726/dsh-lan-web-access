/**
 * 局域网入口：单独监听一个端口，查过允许列表和登录后，把请求转发给本机的 dsh（含 WebSocket）。
 *
 * 这是局域网设备唯一的入口，所有检查必须在转发之前做完：转发过去就等于本机身份。
 * 插件自己的管理接口不转发。
 */
import type { Runtime } from './runtime.ts';
import type { Settings } from './settings.ts';
export interface GatewayHandle {
    /** 按当前设置断开不该再连着的长连接（被踢、被移出列表、免密被关）。 */
    enforce(revokedSids?: string[]): void;
    /** 在 host:port 上监听；地址变了就关掉重开。 */
    start(host: string, port: number): Promise<void>;
    /** 关掉入口，并立即断开所有已连着的设备（含 WebSocket）。 */
    stop(): Promise<void>;
    readonly listening: boolean;
    readonly address: string | null;
}
export declare function whitelistAllows(ip: string, settings: Settings): boolean;
export declare function createGateway(rt: Runtime): GatewayHandle;
