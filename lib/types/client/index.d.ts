/**
 * 设置面板「局域网web访问」标签页（浏览器半）。
 *
 * 按 设计稿 定稿实现：状态头（总开关）→ 分段切换 → 当前分段。
 * 分段随开发阶段逐个加入：第 1 阶段有「连接」（本机部分）和「关于」（版本与运行环境），
 * 设备、安全两段在各自阶段加入；没做的分段不出现，不留点了没反应的东西。
 * 所有读写走 `/api/remote-access/*` 普通 fetch。局域网设备打开时只读（`local === false`）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ReactElement } from 'react';
export declare const inject: string[];
export declare function RemoteAccessSection(_props: PropsRuntime<'settings.section'>): ReactElement;
export declare function apply(ctx: Context): void;
