import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ERROR_CODES } from "../shared.js";
import { zh as t } from "./strings.js";
/** 保存不到这么久就不显示「进行中」。 */
export const BUSY_DELAY_MS = 1000;
/** 「关不掉」红字提示停留时长。 */
export const INLINE_ERROR_MS = 3000;
/** 底部提示条停留时长。 */
export const TOAST_MS = 3000;
export function getStatus() {
    return getJson('status');
}
export const API = '/api/remote-access';
/** 读一个本机接口的 JSON；失败返回 undefined。 */
export async function getJson(path) {
    try {
        const res = await fetch(`${API}/${path}`, { cache: 'no-store' });
        if (!res.ok)
            return undefined;
        return (await res.json());
    }
    catch {
        return undefined;
    }
}
/** 往本机接口 POST 一段 JSON，按「没送到 / 被拒（带错误码）/ 成功」返回。 */
export async function postJson(path, body) {
    let res;
    try {
        res = await fetch(`${API}/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
    }
    catch {
        return { ok: false, kind: 'network' };
    }
    if (res.ok)
        return { ok: true, data: await res.json().catch(() => undefined) };
    const data = (await res.json().catch(() => ({})));
    return { ok: false, kind: 'rejected', code: data.code, port: data.port };
}
/** 保存失败时给用户看的那句话：按原因分，不一律说「没有响应」。 */
export function failureText(failure) {
    if (failure.kind === 'network')
        return t.errors.noResponse;
    switch (failure.code) {
        case ERROR_CODES.localOnly:
            return t.errors.localOnly;
        case ERROR_CODES.loginRequired:
            return t.errors.loginRequired;
        case ERROR_CODES.passwordRequired:
            return t.conn.needPassword;
        case ERROR_CODES.invalidSetting:
            return t.errors.invalidSetting;
        case ERROR_CODES.duplicate:
            return t.errors.duplicate;
        default:
            return t.errors.rejected;
    }
}
export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    }
    catch {
        // 非安全上下文没有 clipboard API：退回选中文本复制。
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        // 选中文本会把焦点拿走，复制完还给原来的按钮，键盘用户不会掉到页面最外层。
        const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        document.body.append(el);
        el.select();
        const ok = document.execCommand('copy');
        el.remove();
        back?.focus();
        return ok;
    }
}
/** 组件是否还挂着；异步回来后据此决定还要不要更新状态、开定时器。 */
export function useMounted() {
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    return mounted;
}
// ── 图标（线性，1.6 粗细） ────────────────────────────────────────────────────
export const WifiIcon = () => (_jsxs("svg", { width: "26", height: "26", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [_jsx("path", { d: "M5 12.5a10 10 0 0 1 14 0" }), _jsx("path", { d: "M8.5 16a5 5 0 0 1 7 0" }), _jsx("path", { d: "M1.5 9a15 15 0 0 1 21 0" }), _jsx("circle", { cx: "12", cy: "19.5", r: "1" })] }));
export const CopyIcon = () => (_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [_jsx("rect", { x: "9", y: "9", width: "12", height: "12", rx: "2" }), _jsx("path", { d: "M5 15V5a2 2 0 0 1 2-2h10" })] }));
export const InfoIcon = () => (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", "aria-hidden": "true", children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("path", { d: "M12 11v5M12 8h.01" })] }));
export const WarnIcon = () => (_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [_jsx("path", { d: "M12 3 2 20h20L12 3z" }), _jsx("path", { d: "M12 10v4M12 17h.01" })] }));
export const CheckIcon = () => (_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: _jsx("path", { d: "m5 12 5 5 9-10" }) }));
export const BangIcon = () => (_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", "aria-hidden": "true", children: _jsx("path", { d: "M12 7v6M12 17h.01" }) }));
/**
 * 一个开关的保存：同一时刻只允许一次（连点时后面的点击直接忽略），超过 1 秒才显示
 * 「进行中」，组件卸载后不再更新状态。
 */
export function useSave(onSaved, path = 'settings') {
    const [busy, setBusy] = useState(false);
    const saving = useRef(false);
    const mounted = useMounted();
    const save = useCallback(async (patch) => {
        if (saving.current)
            return undefined;
        saving.current = true;
        const timer = setTimeout(() => {
            if (mounted.current)
                setBusy(true);
        }, BUSY_DELAY_MS);
        const result = await postJson(path, patch);
        clearTimeout(timer);
        saving.current = false;
        if (!mounted.current)
            return undefined;
        setBusy(false);
        if (result.ok)
            onSaved();
        return result;
    }, [onSaved, mounted, path]);
    const isSaving = useCallback(() => saving.current, []);
    return [busy, save, isSaving];
}
/** 下拉选择的保存：以最后一次选的为准，上一次还在保存时排队；失败弹回并提示。 */
export function useSelectSetting(serverValue, key, onSaved, showToast) {
    const [shown, setShown] = useState();
    const [, save, isSaving] = useSave(onSaved);
    const queued = useRef(undefined);
    useEffect(() => {
        if (shown !== undefined && shown === serverValue && !isSaving() && queued.current === undefined)
            setShown(undefined);
    }, [serverValue, shown, isSaving]);
    const send = async (value) => {
        const result = await save({ [key]: value });
        const next = queued.current;
        if (next !== undefined) {
            queued.current = undefined;
            await send(next);
            return;
        }
        if (result !== undefined && !result.ok) {
            setShown(undefined);
            showToast({ kind: 'bad', text: failureText(result) });
        }
    };
    const change = (next) => {
        setShown(next);
        if (isSaving())
            queued.current = next;
        else
            void send(next);
    };
    return [shown ?? serverValue, change];
}
/** 开关。保存中用 aria-disabled 而不是原生 disabled，键盘焦点不会丢。 */
export function Switch({ checked, label, busy, onToggle, }) {
    return (_jsx("button", { type: "button", className: "switch", role: "switch", "aria-checked": checked, "aria-label": label, "aria-busy": busy || undefined, "aria-disabled": busy || undefined, onClick: () => {
            if (!busy)
                onToggle(!checked);
        } }));
}
export function useGuardedSwitch(value, key, onChanged, showToast, inlineFor) {
    const [optimistic, setOptimistic] = useState();
    const [inlineError, setInlineError] = useState();
    const errorTimer = useRef(undefined);
    const mounted = useMounted();
    const [busy, save, isSaving] = useSave(onChanged);
    useEffect(() => setOptimistic(undefined), [value]);
    useEffect(() => () => clearTimeout(errorTimer.current), []);
    const toggle = (next) => {
        if (isSaving())
            return;
        setOptimistic(next);
        void save({ [key]: next }).then((result) => {
            if (result === undefined || result.ok || !mounted.current)
                return;
            setOptimistic(undefined);
            const inline = inlineFor(result);
            if (inline === undefined) {
                showToast({ kind: 'bad', text: failureText(result) });
                return;
            }
            // 平时不加说明，失败时才原地显示红字。
            clearTimeout(errorTimer.current);
            setInlineError(inline);
            errorTimer.current = setTimeout(() => {
                if (mounted.current)
                    setInlineError(undefined);
            }, INLINE_ERROR_MS);
        });
    };
    return { checked: optimistic ?? value, busy, inlineError, toggle };
}
/** 设置行的说明：常驻 aria-live 区，有提示时换成提示文字（红 / 绿），读屏软件会念出来。 */
export function RowDesc({ text, alert, }) {
    return (_jsx("p", { className: `row-desc${alert ? ` ${alert.kind}` : ''}`, "aria-live": "polite", children: alert?.text ?? text }));
}
const svg = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
};
export const ChevronIcon = () => (_jsx("svg", { className: "chev", width: "8", height: "13", viewBox: "0 0 8 13", strokeWidth: "1.8", ...svg, children: _jsx("path", { d: "m1.5 1.5 5 5-5 5" }) }));
export const PlusIcon = ({ size = 16 }) => (_jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", strokeWidth: "2", ...svg, children: _jsx("path", { d: "M12 5v14M5 12h14" }) }));
export const EyeIcon = () => (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", strokeWidth: "1.6", ...svg, children: [_jsx("path", { d: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] }));
export const XSmallIcon = () => (_jsx("svg", { width: "10", height: "10", viewBox: "0 0 24 24", strokeWidth: "3", ...svg, children: _jsx("path", { d: "M6 6l12 12M18 6 6 18" }) }));
export const BangSmallIcon = () => (_jsx("svg", { width: "10", height: "10", viewBox: "0 0 24 24", strokeWidth: "3", ...svg, children: _jsx("path", { d: "M12 6v8M12 18h.01" }) }));
export const CheckSmallIcon = () => (_jsx("svg", { width: "11", height: "11", viewBox: "0 0 24 24", strokeWidth: "2.6", ...svg, children: _jsx("path", { d: "m5 12 5 5 9-10" }) }));
export const DashSmallIcon = () => (_jsx("svg", { width: "10", height: "10", viewBox: "0 0 24 24", strokeWidth: "3", ...svg, children: _jsx("path", { d: "M7 12h10" }) }));
export const Spinner = () => _jsx("span", { className: "spin", "aria-hidden": "true" });
/** 「多久前」：刚刚 / N 分钟前 / N 小时前 / N 天前。 */
export function ago(ts, now = Date.now()) {
    const s = Math.max(0, Math.round((now - ts) / 1000));
    if (s < 60)
        return t.time.justNow;
    if (s < 3600)
        return t.time.minutes(Math.floor(s / 60));
    if (s < 86400)
        return t.time.hours(Math.floor(s / 3600));
    return t.time.days(Math.floor(s / 86400));
}
/** 弹出面板：Esc 或点空白关闭（不会连带关掉 dsh 设置窗口），Tab 只在面板里转，关掉后焦点回到原按钮。 */
export function Sheet({ title, lead, role = 'dialog', onClose, children, wide = false, }) {
    const ref = useRef(null);
    const titleId = useId();
    const leadId = useId();
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
        const opener = document.activeElement;
        const first = ref.current?.querySelector('[data-autofocus], input, button');
        first?.focus();
        // Esc 先由面板接住，只关面板，不让 dsh 把设置窗口一起关掉。
        const onEsc = (e) => {
            if (e.key !== 'Escape')
                return;
            e.preventDefault();
            e.stopImmediatePropagation();
            closeRef.current();
        };
        document.addEventListener('keydown', onEsc, true);
        // 面板里获得焦点的元素被移除时，把焦点放回面板，键盘操作不掉到页面上。
        const observer = new MutationObserver(() => {
            if (ref.current && !ref.current.contains(document.activeElement))
                ref.current.focus();
        });
        if (ref.current)
            observer.observe(ref.current, { childList: true, subtree: true });
        return () => {
            document.removeEventListener('keydown', onEsc, true);
            observer.disconnect();
            opener?.focus?.();
        };
    }, []);
    const onKeyDown = (e) => {
        if (e.key !== 'Tab' || ref.current === null)
            return;
        const items = [
            ...ref.current.querySelectorAll('button:not([tabindex="-1"]), input:not([tabindex="-1"]), select:not([tabindex="-1"]), [tabindex="0"]'),
        ].filter((el) => !el.hasAttribute('disabled'));
        if (items.length === 0)
            return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
        else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };
    return (_jsx("div", { className: "scrim", onMouseDown: (e) => {
            if (e.target === e.currentTarget)
                onClose();
        }, children: _jsxs("div", { ref: ref, className: `sheet${wide ? ' wide' : ''}`, tabIndex: -1, role: role, "aria-modal": "true", "aria-labelledby": titleId, "aria-describedby": lead ? leadId : undefined, onKeyDown: onKeyDown, children: [_jsxs("div", { children: [_jsx("h3", { id: titleId, children: title }), lead && (_jsx("p", { className: "lead", id: leadId, children: lead }))] }), children] }) }));
}
