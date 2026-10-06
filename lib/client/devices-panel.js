import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { whitelistValueKind } from "../shared.js";
import { zh as t } from "./strings.js";
import { ChevronIcon, PlusIcon, RowDesc, Sheet, Switch, ago, failureText, getJson, postJson, useMounted, useSave, useSelectSetting, } from "./ui.js";
/** 设置页开着时多久刷新一次设备表（登录状态、多久前活跃）。 */
const DEVICES_POLL_MS = 5000;
/** 和后端 isValidWhitelistValue 同一套规则：IPv4、IPv4/前缀、IPv6 单个地址。 */
export function checkValue(raw, taken) {
    const v = raw.trim();
    if (v === '')
        return { kind: 'empty' };
    // 和后端保存时用的是同一份校验（shared.ts），这里说能加的，保存时不会被拒。
    const kind = whitelistValueKind(v);
    if (kind !== 'invalid' && taken.includes(v))
        return { kind: 'duplicate' };
    return { kind };
}
function valueMessage(check) {
    switch (check.kind) {
        case 'empty':
            return { text: t.dev.valueHint, bad: false };
        case 'single':
            return { text: t.dev.valueSingle, bad: false };
        case 'range':
            return { text: t.dev.valueRange, bad: false };
        case 'duplicate':
            return { text: t.dev.valueDuplicate, bad: true };
        default:
            return { text: t.dev.valueInvalid, bad: true };
    }
}
const label = (e) => e.name || e.value;
/** 一行的状态句：已登录 · 浏览器 · 多久前活跃 / N 个浏览器已登录 / 免密码 / 未登录。 */
function statusLine(entry, bypass) {
    const n = entry.sessions.length;
    if (n === 1) {
        const s = entry.sessions[0];
        return {
            dot: 'ok',
            text: `${t.dev.loggedIn} · ${s.browser} · ${t.dev.active(ago(s.lastSeenAt))}`,
        };
    }
    if (n > 1) {
        const browsers = [...new Set(entry.sessions.map((s) => s.browser))].join('、');
        return { dot: 'ok', text: `${t.dev.manyLoggedIn(n)} · ${browsers}` };
    }
    if (bypass)
        return {
            dot: entry.lastSeenAt !== null ? 'ok' : 'idle',
            text: entry.lastSeenAt !== null
                ? `${t.dev.bypass} · ${t.dev.active(ago(entry.lastSeenAt))}`
                : `${t.dev.bypass} · ${t.dev.neverSeen}`,
        };
    return { dot: 'idle', text: t.dev.notLoggedIn };
}
export function DevicesPanel({ local, showToast, onChanged, active, }) {
    const [view, setView] = useState();
    const [loadFailed, setLoadFailed] = useState(false);
    /** 最新一次读到的列表（撤销移出时用它，不用移出那一刻的旧列表）。 */
    const viewRef = useRef(undefined);
    /** 退出登录正在发：连点不重复发。 */
    const kicking = useRef(false);
    const [openId, setOpenId] = useState();
    const [adding, setAdding] = useState(false);
    const mounted = useMounted();
    const seq = useRef(0);
    const load = useCallback(async () => {
        if (!local)
            return;
        const n = ++seq.current;
        const v = await getJson('devices');
        if (!mounted.current || n !== seq.current)
            return;
        if (v === undefined) {
            setLoadFailed(true);
            return;
        }
        setLoadFailed(false);
        viewRef.current = v;
        setView(v);
    }, [local, mounted]);
    useEffect(() => {
        if (!active)
            return;
        void load();
        const timer = setInterval(() => void load(), DEVICES_POLL_MS);
        return () => clearInterval(timer);
    }, [load, active]);
    const refresh = useCallback(() => {
        void load();
        onChanged();
    }, [load, onChanged]);
    /** 打开「添加设备」时重读一次：刚被拒的设备马上出现在「最近被拒绝的地址」里，不等下一轮刷新。 */
    const openAdd = () => {
        setAdding(true);
        void load();
    };
    const [, saveList] = useSave(refresh);
    /** 写回整张允许列表；失败给提示。 */
    const writeList = async (list) => {
        const result = await saveList({ whitelist: list });
        if (result === undefined)
            return false;
        if (!result.ok)
            showToast({ kind: 'bad', text: failureText(result) });
        return result.ok;
    };
    const signOut = async (session, who) => {
        if (kicking.current)
            return;
        kicking.current = true;
        const result = await postJson('kick', { sid: session.sid });
        kicking.current = false;
        if (!mounted.current)
            return;
        if (result.ok) {
            showToast({ kind: 'ok', text: t.dev.signedOut(t.dev.whoBrowser(who, session.browser)) });
            refresh();
        }
        else
            showToast({ kind: 'bad', text: failureText(result) });
    };
    const signOutAll = async () => {
        if (kicking.current)
            return;
        kicking.current = true;
        const result = await postJson('kick-all', {});
        kicking.current = false;
        if (!mounted.current)
            return;
        if (result.ok) {
            showToast({ kind: 'ok', text: t.dev.signedOutAll });
            refresh();
        }
        else
            showToast({ kind: 'bad', text: failureText(result) });
    };
    const [emptyMode, setEmptyMode] = useSelectSetting(view?.emptyMode ?? 'deny-all', 'whitelistEmptyMode', refresh, showToast);
    if (!local)
        return _jsx(_Fragment, {});
    if (view === undefined)
        return loadFailed ? (_jsx("div", { className: "group-wrap", children: _jsx("div", { className: "group", children: _jsxs("div", { className: "empty", children: [_jsx("p", { children: t.dev.loadFailed }), _jsx("button", { type: "button", className: "btn sm", onClick: () => void load(), children: t.dev.retry })] }) }) })) : (_jsx(_Fragment, {}));
    const entries = view.entries;
    const list = entries.map(({ id, name, value }) => ({ id, name, value }));
    const anyLoggedIn = entries.some((e) => e.sessions.length > 0) || view.others.length > 0;
    const open = entries.find((e) => e.id === openId);
    const remove = async (entry) => {
        setOpenId(undefined);
        const index = list.findIndex((e) => e.id === entry.id);
        const next = list.filter((e) => e.id !== entry.id);
        if (!(await writeList(next)))
            return;
        // 打开面板的那一行没了：焦点放到「添加设备」上，键盘用户不会掉到页面最外层。
        requestAnimationFrame(() => document
            .querySelector('.dla #dla-panel-dev .row.add, .dla #dla-panel-dev .empty .btn')
            ?.focus());
        showToast({
            kind: 'plain',
            text: t.dev.removed(label(entry)),
            undo: () => {
                // 撤销：在「现在」的列表里放回原位置，这 5 秒内新加的设备不会被冲掉
                // （已失效的登录回不来，它要重新输一次密码——用户 2026-10-05 确认）。
                const current = (viewRef.current?.entries ?? []).map(({ id, name, value }) => ({
                    id,
                    name,
                    value,
                }));
                if (current.some((e) => e.value === entry.value))
                    return;
                const restored = [...current];
                restored.splice(Math.min(index, restored.length), 0, {
                    id: entry.id,
                    name: entry.name,
                    value: entry.value,
                });
                void writeList(restored);
            },
        });
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "group-wrap", children: [_jsxs("h2", { className: "group-head", children: [_jsxs("span", { children: [t.dev.groupTitle, " ", _jsx("span", { className: "count", children: entries.length })] }), entries.length > 0 && (_jsx("button", { type: "button", className: "btn plain sm", disabled: !anyLoggedIn, onClick: () => void signOutAll(), children: t.dev.signOutAll }))] }), _jsx("div", { className: "group", children: entries.length === 0 ? (_jsxs("div", { className: "empty", children: [_jsx("p", { children: t.dev.emptyText }), _jsxs("button", { type: "button", className: "btn primary sm", onClick: openAdd, children: [_jsx(PlusIcon, { size: 12 }), t.dev.addShort] })] })) : (_jsxs(_Fragment, { children: [entries.map((entry) => {
                                    const line = statusLine(entry, view.bypassPassword);
                                    return (_jsxs("button", { type: "button", className: "row", onClick: () => setOpenId(entry.id), children: [_jsxs("div", { className: "row-main", children: [_jsx("p", { className: "row-label", children: label(entry) }), _jsxs("p", { className: "row-desc inline", children: [_jsx("span", { className: "mono", children: entry.value }), _jsx("span", { children: "\u00B7" }), _jsx("span", { className: `dot${line.dot === 'ok' ? ' ok' : ''}` }), _jsx("span", { children: line.text })] })] }), _jsx(ChevronIcon, {})] }, entry.id));
                                }), _jsxs("button", { type: "button", className: "row add", onClick: openAdd, children: [_jsx("span", { className: "plus", children: _jsx(PlusIcon, {}) }), _jsx("div", { className: "row-main", children: _jsx("p", { className: "row-label", children: t.dev.add }) })] })] })) }), _jsx("p", { className: "group-foot", children: entries.length === 0 ? t.dev.emptyFoot(t.dev.emptyMode[view.emptyMode]) : t.dev.foot })] }), view.others.length > 0 && (_jsxs("div", { className: "group-wrap", children: [_jsx("h2", { className: "group-head", children: t.dev.othersTitle }), _jsx("div", { className: "group", children: view.others.map((s) => (_jsxs("div", { className: "row", children: [_jsxs("div", { className: "row-main", children: [_jsxs("p", { className: "row-label", children: [s.browser, " \u00B7 ", s.os] }), _jsxs("p", { className: "row-desc inline", children: [_jsx("span", { className: "mono", children: s.ip }), _jsx("span", { children: "\u00B7" }), _jsx("span", { className: "dot ok" }), _jsx("span", { children: t.dev.active(ago(s.lastSeenAt)) })] })] }), _jsx("button", { type: "button", className: "btn sm", onClick: () => void signOut(s, s.ip), children: t.dev.signOut })] }, s.sid))) }), _jsx("p", { className: "group-foot", children: t.dev.othersDesc })] })), _jsx("div", { className: "group-wrap", children: _jsxs("div", { className: "group", children: [_jsxs("div", { className: "row", children: [_jsx("div", { className: "row-main", children: _jsx("p", { className: "row-label", children: t.dev.emptyModeLabel }) }), _jsxs("select", { className: "select", "aria-label": t.dev.emptyModeLabel, value: emptyMode, onChange: (e) => setEmptyMode(e.target.value), children: [_jsx("option", { value: "deny-all", children: t.dev.emptyMode['deny-all'] }), _jsx("option", { value: "private-only", children: t.dev.emptyMode['private-only'] })] })] }), _jsx(BypassRow, { value: view.bypassPassword, onChanged: refresh, showToast: showToast })] }) }), open !== undefined && (_jsx(DeviceSheet, { entry: open, bypass: view.bypassPassword, taken: list.filter((e) => e.id !== open.id).map((e) => e.value), onClose: () => setOpenId(undefined), onSave: async (name, value) => {
                    const ok = await writeList(list.map((e) => e.id === open.id ? { ...e, name: name.trim(), value: value.trim() } : e));
                    if (ok)
                        setOpenId(undefined);
                }, onRemove: () => void remove(open), onSignOut: (s) => void signOut(s, label(open)) })), adding && (_jsx(AddSheet, { bypass: view.bypassPassword, taken: list.map((e) => e.value), recent: view.recentDenied, onClose: () => setAdding(false), onAdd: async (name, value) => {
                    const entry = {
                        id: `wl-${Date.now().toString(36)}`,
                        name: name.trim(),
                        value: value.trim(),
                    };
                    if (await writeList([...list, entry])) {
                        setAdding(false);
                        showToast({ kind: 'ok', text: t.dev.added(label(entry)) });
                    }
                } }))] }));
}
function BypassRow({ value, onChanged, showToast, }) {
    const [optimistic, setOptimistic] = useState();
    const [busy, save, isSaving] = useSave(onChanged);
    useEffect(() => setOptimistic(undefined), [value]);
    return (_jsxs("div", { className: "row", children: [_jsxs("div", { className: "row-main", children: [_jsx("p", { className: "row-label", children: t.dev.bypassLabel }), _jsx(RowDesc, { text: t.dev.bypassDesc })] }), _jsx(Switch, { checked: optimistic ?? value, label: t.dev.bypassLabel, busy: busy, onToggle: (next) => {
                    if (isSaving())
                        return;
                    setOptimistic(next);
                    void save({ whitelistBypassPassword: next }).then((r) => {
                        if (r === undefined || r.ok)
                            return;
                        setOptimistic(undefined);
                        showToast({ kind: 'bad', text: failureText(r) });
                    });
                } })] }));
}
function DeviceSheet({ entry, bypass, taken, onClose, onSave, onRemove, onSignOut, }) {
    const [name, setName] = useState(entry.name);
    const [value, setValue] = useState(entry.value);
    const check = checkValue(value, taken);
    const valid = check.kind === 'single' || check.kind === 'range';
    const changed = name.trim() !== entry.name || value.trim() !== entry.value;
    const msg = valueMessage(check);
    return (_jsxs(Sheet, { title: label(entry), lead: t.dev.detailLead, onClose: onClose, children: [_jsxs("label", { className: "f", children: [t.dev.nameLabel, _jsx("input", { className: "field", value: name, placeholder: t.dev.namePlaceholder, onChange: (e) => setName(e.target.value), "data-autofocus": "" })] }), _jsxs("label", { className: "f", children: [t.dev.valueLabel, _jsx("input", { className: "field mono", value: value, "aria-invalid": msg.bad || undefined, onChange: (e) => setValue(e.target.value) })] }), (msg.bad || value.trim() !== entry.value) && (_jsx("p", { className: `msg${msg.bad ? ' bad' : ''}`, role: "status", children: msg.text })), _jsxs("div", { className: "group-wrap", children: [_jsx("span", { className: "sub", children: t.dev.loginState }), entry.sessions.length > 0 ? (_jsx("div", { className: "group", children: entry.sessions.map((s) => (_jsxs("div", { className: "row", children: [_jsxs("div", { className: "row-main", children: [_jsxs("p", { className: "row-label", children: [s.browser, " \u00B7 ", s.os] }), _jsxs("p", { className: "row-desc inline", children: [_jsx("span", { className: "dot ok" }), _jsxs("span", { children: [t.dev.loggedIn, " \u00B7 ", t.dev.active(ago(s.lastSeenAt)), " \u00B7", ' ', t.dev.loginSince(t.dev.date(new Date(s.createdAt)))] })] })] }), _jsx("button", { type: "button", className: "btn sm", onClick: () => onSignOut(s), children: t.dev.signOut })] }, s.sid))) })) : null, _jsx("p", { className: "msg", children: entry.sessions.length > 0
                            ? t.dev.signOutNote
                            : bypass
                                ? t.dev.bypassNote
                                : t.dev.noSessions })] }), _jsxs("div", { className: "sheet-actions", children: [_jsx("button", { type: "button", className: "btn danger left", onClick: onRemove, children: t.dev.remove }), _jsx("button", { type: "button", className: "btn", onClick: onClose, children: t.dev.cancel }), _jsx("button", { type: "button", className: "btn primary", disabled: changed && !valid, onClick: () => (changed ? void onSave(name, value) : onClose()), children: t.dev.done })] })] }));
}
function AddSheet({ bypass, taken, recent, onClose, onAdd, }) {
    const [name, setName] = useState('');
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const check = checkValue(value, taken);
    const valid = check.kind === 'single' || check.kind === 'range';
    const msg = valueMessage(check);
    const usable = recent.filter((d) => !taken.includes(d.ip));
    return (_jsxs(Sheet, { title: t.dev.addTitle, lead: bypass ? t.dev.addLeadBypass : t.dev.addLead, onClose: onClose, children: [_jsxs("label", { className: "f", children: [t.dev.nameLabel, _jsx("input", { className: "field", value: name, placeholder: t.dev.namePlaceholder, onChange: (e) => setName(e.target.value), "data-autofocus": "" })] }), _jsxs("label", { className: "f", children: [t.dev.valueLabel, _jsx("input", { className: "field mono", value: value, placeholder: t.dev.valuePlaceholder, "aria-invalid": msg.bad || undefined, onChange: (e) => setValue(e.target.value), onKeyDown: (e) => {
                            if (e.key === 'Enter' && valid && !busy) {
                                setBusy(true);
                                void onAdd(name, value).finally(() => setBusy(false));
                            }
                        } })] }), _jsx("p", { className: `msg${msg.bad ? ' bad' : ''}`, role: "status", children: msg.text }), usable.length > 0 && (_jsxs("div", { className: "group-wrap", children: [_jsx("span", { className: "sub", children: t.dev.recentTitle }), _jsx("div", { className: "chips", children: usable.map((d) => (_jsxs("button", { type: "button", className: "chip", "aria-pressed": value.trim() === d.ip, onClick: () => setValue(d.ip), children: [_jsx("span", { className: "mono", children: d.ip }), _jsx("span", { className: "t3", children: t.dev.recentMeta(d.count, ago(d.lastAt)) })] }, d.ip))) })] })), _jsxs("div", { className: "sheet-actions", children: [_jsx("button", { type: "button", className: "btn", onClick: onClose, children: t.dev.cancel }), _jsx("button", { type: "button", className: "btn primary", disabled: !valid || busy, onClick: () => {
                            setBusy(true);
                            void onAdd(name, value).finally(() => setBusy(false));
                        }, children: t.dev.addConfirm })] })] }));
}
