/**
 * dsh-lan-web-access 插件入口。
 *
 * 职责：装配运行时（设置/会话/限速/日志/credentials）、安装守卫（路由包装 +
 * 原生 Cookie 补签）、注册管理 API、启动局域网网关、订阅设置变更做热更新，
 * 并在 `connection/request` 官方扩展点加一道会话闸门（主防线）。
 *
 * 安全退出（R-008）：启动时跑五项运行检查，前四项任一不过 → 守卫不再补签、闸门放给 dsh 官方认证、
 * 局域网入口关闭；点「重新检查」或下次启动检查全过就自动恢复。
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { IncomingMessage, ServerResponse } from 'node:http';
export declare const name = "dsh-lan-web-access";
export declare const inject: string[];
/**
 * 插件配置：没有。所有设置都在设置页里改，存在 `~/.dsh/remote-access.json`；
 * 不在 dsh 的插件配置里放一份不生效的同名项。
 */
export type Config = object;
export declare const Config: z<Config>;
declare module '@deepseek-ai/cordis' {
    interface Events {
        'connection/request'(request: IncomingMessage, response: ServerResponse, next: () => Promise<void>): Promise<void>;
    }
}
export declare function apply(ctx: Context, _config: Config): void;
