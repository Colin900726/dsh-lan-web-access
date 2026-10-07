/**
 * 插件入口：装好登录检查、管理接口和局域网入口，设置变了就跟着更新。
 *
 * 启动时跑五项运行检查，前四项有没过的就「安全退出」：交回 dsh 官方认证、关掉局域网入口，
 * 检查重新通过后自动恢复。
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { IncomingMessage, ServerResponse } from 'node:http';
export declare const name = "dsh-lan-web-access";
export declare const inject: string[];
/** 插件配置：没有，设置都在设置页里改。 */
export type Config = object;
export declare const Config: z<Config>;
declare module '@deepseek-ai/cordis' {
    interface Events {
        'connection/request'(request: IncomingMessage, response: ServerResponse, next: () => Promise<void>): Promise<void>;
    }
}
export declare function apply(ctx: Context, _config: Config): void;
