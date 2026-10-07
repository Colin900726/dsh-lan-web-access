/**
 * 设置页的公用零件：和后端说话、开关、行说明、提示条类型、图标、保存过程。
 * 各分段（连接、设备、安全、关于）都从这里取，不各写一套。
 */
import type { ReactElement, ReactNode } from 'react';
import { type RemoteAccessStatus } from '../shared.ts';
type Status = RemoteAccessStatus;
/** 底部提示条。带 undo 时右边出「撤销」按钮（能撤销的操作不弹确认，做完给撤销）。 */
export type Toast = {
    kind: 'ok' | 'bad' | 'plain';
    text: string;
    undo?: () => void;
};
export type SaveFailure = {
    kind: 'network';
} | {
    kind: 'rejected';
    code?: string;
    port?: number;
};
export type SaveResult = {
    ok: true;
    data?: unknown;
} | ({
    ok: false;
} & SaveFailure);
/** 保存不到这么久就不显示「进行中」。 */
export declare const BUSY_DELAY_MS = 1000;
/** 「关不掉」红字提示停留时长。 */
export declare const INLINE_ERROR_MS = 3000;
/** 底部提示条停留时长。 */
export declare const TOAST_MS = 3000;
export declare function getStatus(): Promise<Status | undefined>;
export declare const API = "/api/remote-access";
/** 读一个本机接口的 JSON；失败返回 undefined。 */
export declare function getJson<T>(path: string): Promise<T | undefined>;
/** 往本机接口 POST 一段 JSON，按「没送到 / 被拒（带错误码）/ 成功」返回。 */
export declare function postJson(path: string, body: unknown): Promise<SaveResult>;
/** 保存失败时给用户看的那句话：按原因分，不一律说「没有响应」。 */
export declare function failureText(failure: SaveFailure): string;
export declare function copyText(text: string): Promise<boolean>;
/** 组件是否还挂着；异步回来后据此决定还要不要更新状态、开定时器。 */
export declare function useMounted(): {
    readonly current: boolean;
};
export declare const WifiIcon: () => ReactElement;
export declare const CopyIcon: () => ReactElement;
export declare const InfoIcon: () => ReactElement;
export declare const WarnIcon: () => ReactElement;
export declare const CheckIcon: () => ReactElement;
export declare const BangIcon: () => ReactElement;
/**
 * 一个开关的保存：同一时刻只允许一次（连点时后面的点击直接忽略），超过 1 秒才显示
 * 「进行中」，组件卸载后不再更新状态。
 */
export declare function useSave(onSaved: () => void, path?: string): [
    busy: boolean,
    save: (patch: Record<string, unknown>) => Promise<SaveResult | undefined>,
    isSaving: () => boolean
];
/** 下拉选择的保存：以最后一次选的为准，上一次还在保存时排队；失败弹回并提示。 */
export declare function useSelectSetting<T extends string | number>(serverValue: T, key: string, onSaved: () => void, showToast: (toast: Toast) => void, 
/** 失败时自己说原因（返回 true 表示已处理），不给就弹通用提示条。 */
onFailed?: (failure: SaveFailure) => boolean): [value: T, change: (next: T) => void];
/** 开关。保存中用 aria-disabled 而不是原生 disabled，键盘焦点不会丢。 */
export declare function Switch({ checked, label, busy, onToggle, }: {
    checked: boolean;
    label: string;
    busy: boolean;
    onToggle: (next: boolean) => void;
}): ReactElement;
export declare function useGuardedSwitch(value: boolean, key: string, onChanged: () => void, showToast: (t: Toast) => void, inlineFor: (failure: SaveFailure & {
    port?: number;
}) => string | undefined): {
    checked: boolean;
    busy: boolean;
    inlineError: string | undefined;
    toggle: (next: boolean) => void;
};
/** 设置行的说明：常驻 aria-live 区，有提示时换成提示文字（红 / 绿），读屏软件会念出来。 */
export declare function RowDesc({ text, alert, }: {
    text: string;
    alert?: {
        kind: 'bad' | 'ok';
        text: string;
    };
}): ReactElement;
export declare const ChevronIcon: () => ReactElement;
export declare const PlusIcon: ({ size }: {
    size?: number;
}) => ReactElement;
export declare const EyeIcon: () => ReactElement;
export declare const XSmallIcon: () => ReactElement;
export declare const BangSmallIcon: () => ReactElement;
export declare const CheckSmallIcon: () => ReactElement;
export declare const DashSmallIcon: () => ReactElement;
export declare const Spinner: () => ReactElement;
/** 「多久前」：刚刚 / N 分钟前 / N 小时前 / N 天前。 */
export declare function ago(ts: number, now?: number): string;
/** 弹出面板：Esc 或点空白关闭（不会连带关掉 dsh 设置窗口），Tab 只在面板里转，关掉后焦点回到原按钮。 */
export declare function Sheet({ title, lead, role, onClose, children, wide, }: {
    title: string;
    lead?: string;
    role?: 'dialog' | 'alertdialog';
    onClose: () => void;
    children: ReactNode;
    wide?: boolean;
}): ReactElement;
export {};
