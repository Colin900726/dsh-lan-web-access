/**
 * 设置页「局域网web访问」：状态头（总开关）+ 四个分段（连接、设备、安全、关于）。
 * 局域网设备打开时只读。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ReactElement } from 'react';
export declare const inject: string[];
export declare function RemoteAccessSection(_props: PropsRuntime<'settings.section'>): ReactElement;
export declare function apply(ctx: Context): void;
