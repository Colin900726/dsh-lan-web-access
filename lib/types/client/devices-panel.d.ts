/**
 * 「设备」分段：允许的设备表（每行带登录状态），点开可改名、退出登录、移出列表；
 * 「添加设备」里列出最近被拒的地址。移出、退出都不弹确认，做完给「撤销」。
 */
import type { ReactElement } from 'react';
import { type Toast } from './ui.tsx';
type ValueCheck = {
    kind: 'empty' | 'single' | 'range' | 'invalid' | 'duplicate';
};
/** 和后端 isValidWhitelistValue 同一套规则：IPv4、IPv4/前缀、IPv6 单个地址。 */
export declare function checkValue(raw: string, taken: string[]): ValueCheck;
export declare function DevicesPanel({ local, showToast, onChanged, active, }: {
    local: boolean;
    showToast: (t: Toast) => void;
    onChanged: () => void;
    /** 「设备」这一页此刻是否打开着：只在打开时定时刷新。 */
    active: boolean;
}): ReactElement;
export {};
