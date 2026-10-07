/**
 * 「安全」分段：管理密码（原地输入，至少 12 位）、登录保持天数、清除密码（唯一弹确认的操作）、
 * 访问记录（最近 3 条，可展开全部并筛选）。
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
