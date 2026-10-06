/**
 * 「设备」分段（R-019 / R-011 / R-017 / R-020）：一张「允许的设备」表，登录状态写在每一行里；
 * 点一行看详情（改名称 / 地址、退出登录、移出列表）；「添加设备」面板列出最近被拒绝的地址。
 * 按 设计稿 定稿实现。移出列表、退出登录都不弹确认，做完给「撤销」或结果提示。
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
