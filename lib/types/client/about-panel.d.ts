/**
 * 「关于」分段（R-015 / R-007 / R-008），按 设计稿 定稿：
 * - 版本：插件（一键更新六种状态）、dsh（是否在支持范围）、运行环境；
 * - 运行检查：五项逐项列出，本机可「重新检查」。
 * 最新版本只在打开「关于」时查（不后台定时查）；局域网设备只看版本和检查结果，没有按钮。
 */
import type { ReactElement } from 'react';
import type { CheckResult } from '../shared.ts';
import { type Toast } from './ui.tsx';
import type { RemoteAccessStatus } from '../shared.ts';
export declare function CheckIcon({ state }: {
    state: CheckResult['state'];
}): ReactElement;
export declare function AboutPanel({ status, active, onChanged, showToast, }: {
    status: RemoteAccessStatus;
    /** 「关于」这一页此刻是否打开着（打开时查一次最新版本）。 */
    active: boolean;
    onChanged: () => void;
    showToast: (t: Toast) => void;
}): ReactElement;
