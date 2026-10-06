/**
 * 「安全」分段（R-014 / R-012），按 设计稿 定稿：
 * - 管理密码：原地展开输入（不弹窗），≥12 位，实时「还差 N 位」，可显示明文；不要求旧密码；
 *   第一次（未设置）时输入框直接展开、按钮写「设置」。
 * - 登录保持：1 / 7 / 14 / 30 天。
 * - 清除密码：全页唯一弹确认的操作；本机免登录关着时，确认框里写明会一并打开。
 * - 访问记录：最近 3 条 +「全部 N 条」面板（全部 / 拒绝 / 登录筛选）。
 */
import type { ReactElement } from 'react';
import { type RemoteAccessStatus } from '../shared.ts';
import { type Toast } from './ui.tsx';
export declare function SecurityPanel({ status, onChanged, showToast, active, }: {
    status: RemoteAccessStatus;
    onChanged: () => void;
    showToast: (t: Toast) => void;
    /** 「安全」这一页此刻是否打开着：只在打开时定时刷新访问记录。 */
    active: boolean;
}): ReactElement;
