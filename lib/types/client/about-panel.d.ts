/**
 * 「关于」分段：插件版本和一键更新、dsh 版本、运行环境、五项运行检查。
 * 只在打开时查最新版本；局域网设备只能看，没有按钮。
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
