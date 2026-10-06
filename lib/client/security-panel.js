import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ERROR_CODES, SESSION_MAX_AGE_CHOICES } from "../shared.js";
import { zh as t } from "./strings.js";
import { BangSmallIcon, CheckSmallIcon, DashSmallIcon, EyeIcon, RowDesc, Sheet, Spinner, XSmallIcon, ago, failureText, getJson, postJson, useMounted, useSelectSetting, } from "./ui.js";
const MIN_PASSWORD = 12;
const RECENT = 3;
/** 访问记录多久刷新一次。 */
const LOG_POLL_MS = 5000;
const FILTERS = ['all', 'deny', 'login'];
const DENY_KINDS = new Set(['whitelist-deny', 'unauthorized', 'cross-site']);
const LOGIN_KINDS = new Set(['login', 'login-failed', 'logout', 'kick']);
function kindLabel(e) {
    return t.sec.kind[e.kind] ?? e.kind;
}
function KindIcon({ e }) {
    if (DENY_KINDS.has(e.kind) || e.kind === 'selfcheck-fail')
        return (_jsx("span", { className: "chk bad", "aria-hidden": "true", children: _jsx(XSmallIcon, {}) }));
    if (e.kind === 'login-failed')
        return (_jsx("span", { className: "chk warn", "aria-hidden": "true", children: _jsx(BangSmallIcon, {}) }));
    if (e.kind === 'login' || e.kind === 'update')
        return (_jsx("span", { className: "chk ok", "aria-hidden": "true", children: _jsx(CheckSmallIcon, {}) }));
    return (_jsx("span", { className: "chk idle", "aria-hidden": "true", children: _jsx(DashSmallIcon, {}) }));
}
const pad = (n) => String(n).padStart(2, '0');
/** 记录时间：今天写「10:42」，昨天写「昨天 10:42」，更早写「9 月 30 日 10:42」；full 时今天也写「今天」。 */
function when(ts, full, now = new Date()) {
    const d = new Date(ts);
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0)
        return full ? `${t.sec.today} ${hm}` : hm;
    if (diff === 1)
        return `${t.sec.yesterday} ${hm}`;
    return `${t.dev.date(d)} ${hm}`;
}
function LogRow({ e, full }) {
    return (_jsxs("div", { className: "row", children: [_jsx(KindIcon, { e: e }), _jsxs("div", { className: "row-main", children: [_jsx("p", { className: "row-label", children: kindLabel(e) }), _jsxs("p", { className: "row-desc inline", children: [_jsx("span", { className: "mono", children: e.ip }), e.name && _jsxs("span", { children: ["\u00B7 ", e.name] }), (e.count ?? 1) > 1 && _jsxs("span", { children: ["\u00B7 ", t.sec.times(e.count ?? 1)] })] })] }), _jsx("span", { className: "row-value mono", children: when(e.ts, full) })] }));
}
export function SecurityPanel({ status, onChanged, showToast, active, }) {
    const [logs, setLogs] = useState([]);
    const [logsFailed, setLogsFailed] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [clearing, setClearing] = useState(false);
    const mounted = useMounted();
    const seq = useRef(0);
    const loadLogs = useCallback(async () => {
        const n = ++seq.current;
        const data = await getJson('logs');
        if (!mounted.current || n !== seq.current)
            return;
        // 读失败不能显示成「还没有记录」：原来有的留着，从没读到过就说读不到。
        setLogsFailed(data === undefined);
        if (data === undefined)
            return;
        setLogs([...data.logs].sort((a, b) => b.ts - a.ts));
    }, [mounted]);
    useEffect(() => {
        if (!active)
            return;
        void loadLogs();
        const timer = setInterval(() => void loadLogs(), LOG_POLL_MS);
        return () => clearInterval(timer);
    }, [loadLogs, active]);
    const refresh = useCallback(() => {
        onChanged();
        void loadLogs();
    }, [onChanged, loadLogs]);
    const [keepDays, setKeepDays] = useSelectSetting(status.sessionMaxAgeDays, 'sessionMaxAgeDays', refresh, showToast);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "group-wrap", children: [_jsx("h2", { className: "group-head", children: t.sec.groupPassword }), _jsxs("div", { className: "group", children: [_jsx(PasswordRows, { status: status, onChanged: refresh, showToast: showToast }), _jsxs("div", { className: "row", children: [_jsxs("div", { className: "row-main", children: [_jsx("p", { className: "row-label", children: t.sec.keepLabel }), _jsx(RowDesc, { text: t.sec.keepDesc })] }), _jsx("select", { className: "select", "aria-label": t.sec.keepLabel, value: keepDays, onChange: (e) => setKeepDays(Number(e.target.value)), children: SESSION_MAX_AGE_CHOICES.map((d) => (_jsx("option", { value: d, children: t.sec.days(d) }, d))) })] }), status.registered && (_jsx("button", { type: "button", className: "row danger", onClick: () => setClearing(true), children: _jsx("div", { className: "row-main", children: _jsx("p", { className: "row-label", children: t.sec.clear }) }) }))] })] }), _jsxs("div", { className: "group-wrap", children: [_jsxs("h2", { className: "group-head", children: [_jsx("span", { children: t.sec.groupLog }), logs.length > 0 && (_jsx("button", { type: "button", className: "btn plain sm", onClick: () => setShowAll(true), children: t.sec.logAll(logs.length) }))] }), _jsx("div", { className: "group", children: logs.length === 0 ? (_jsx("div", { className: "empty", children: _jsx("p", { children: logsFailed ? t.sec.logLoadFailed : t.sec.logEmpty }) })) : (logs.slice(0, RECENT).map((e, i) => _jsx(LogRow, { e: e, full: false }, `${e.ts}-${i}`))) }), _jsx("p", { className: "group-foot", children: t.sec.logFoot })] }), showAll && _jsx(LogSheet, { logs: logs, onClose: () => setShowAll(false) }), clearing && (_jsx(ClearSheet, { reopenLocal: !status.allowLoopback, onClose: () => setClearing(false), onCleared: () => {
                    setClearing(false);
                    showToast({ kind: 'ok', text: t.sec.cleared });
                    refresh();
                }, showToast: showToast }))] }));
}
function PasswordRows({ status, onChanged, showToast, }) {
    const first = !status.registered;
    const [editing, setEditing] = useState(first);
    const [value, setValue] = useState('');
    const [visible, setVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef(null);
    const mounted = useMounted();
    // 密码有没有设变了（在别处设了 / 清了）：没设就展开输入，设了就收起、换成「更改」。
    useEffect(() => {
        setEditing(first);
        setValue('');
    }, [first]);
    useEffect(() => {
        if (editing && !first)
            inputRef.current?.focus();
    }, [editing, first]);
    const left = MIN_PASSWORD - value.length;
    const hintText = value.length === 0
        ? first
            ? t.sec.hintFirst
            : t.sec.hint
        : left > 0
            ? t.sec.short(left)
            : t.sec.enough;
    const submit = async () => {
        if (left > 0 || busy)
            return;
        setBusy(true);
        const result = await postJson('password', { password: value });
        if (!mounted.current)
            return;
        setBusy(false);
        if (result.ok) {
            setValue('');
            setVisible(false);
            setEditing(false);
            showToast({ kind: 'ok', text: first ? t.sec.setDone : t.sec.changed });
            onChanged();
            return;
        }
        if (result.kind === 'rejected' && result.code === ERROR_CODES.tooShort)
            return;
        showToast({ kind: 'bad', text: failureText(result) });
    };
    const stateLine = status.registered
        ? status.passwordSetAt !== null
            ? t.sec.passwordSet(ago(status.passwordSetAt))
            : t.sec.passwordSetNoTime
        : t.sec.passwordUnset;
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row", children: [_jsxs("div", { className: "row-main", children: [_jsx("p", { className: "row-label", children: t.sec.passwordLabel }), _jsxs("p", { className: "row-desc inline", children: [_jsx("span", { className: `dot${status.registered ? ' ok' : ''}` }), _jsx("span", { children: stateLine })] })] }), !first && !editing && (_jsx("button", { type: "button", className: "btn sm", "aria-controls": "dla-pw-edit", "aria-expanded": false, onClick: () => setEditing(true), children: t.sec.change }))] }), editing && (_jsxs("div", { className: "row-expand", id: "dla-pw-edit", children: [_jsxs("div", { className: "line", children: [_jsxs("div", { className: "reveal", children: [_jsx("input", { ref: inputRef, className: "field", type: visible ? 'text' : 'password', placeholder: t.sec.newPassword, autoComplete: "new-password", "aria-label": t.sec.newPassword, "aria-describedby": "dla-pw-msg", value: value, onChange: (e) => setValue(e.target.value), onKeyDown: (e) => {
                                            if (e.key === 'Enter')
                                                void submit();
                                        } }), _jsx("button", { type: "button", className: "icon-btn eye", "aria-label": t.sec.showPassword, "aria-pressed": visible, onClick: () => setVisible((v) => !v), children: _jsx(EyeIcon, {}) })] }), !first && (_jsx("button", { type: "button", className: "btn sm", onClick: () => {
                                    setEditing(false);
                                    setValue('');
                                }, children: t.sec.cancel })), _jsxs("button", { type: "button", className: "btn primary sm", disabled: left > 0, "aria-busy": busy || undefined, onClick: () => void submit(), children: [busy && _jsx(Spinner, {}), first ? t.sec.setFirst : t.sec.save] })] }), _jsxs("p", { className: `msg${value.length > 0 && left <= 0 ? ' ok' : ''}`, id: "dla-pw-msg", "aria-live": "polite", children: [value.length > 0 && left <= 0 && (_jsxs("span", { "aria-hidden": "true", children: [_jsx(CheckSmallIcon, {}), ' '] })), hintText] })] }))] }));
}
function ClearSheet({ reopenLocal, onClose, onCleared, showToast, }) {
    const [busy, setBusy] = useState(false);
    return (_jsx(Sheet, { title: t.sec.clearTitle, lead: reopenLocal ? `${t.sec.clearBody}${t.sec.clearReopenLocal}` : t.sec.clearBody, role: "alertdialog", onClose: onClose, children: _jsxs("div", { className: "sheet-actions", children: [_jsx("button", { type: "button", className: "btn", onClick: onClose, "data-autofocus": "", children: t.sec.cancel }), _jsx("button", { type: "button", className: "btn danger-solid", disabled: busy, onClick: () => {
                        setBusy(true);
                        void postJson('password/clear', {}).then((r) => {
                            setBusy(false);
                            if (r.ok)
                                onCleared();
                            else
                                showToast({ kind: 'bad', text: failureText(r) });
                        });
                    }, children: t.sec.clearConfirm })] }) }));
}
function LogSheet({ logs, onClose }) {
    const [filter, setFilter] = useState('all');
    const shown = logs.filter((e) => filter === 'all' || (filter === 'deny' ? DENY_KINDS.has(e.kind) : LOGIN_KINDS.has(e.kind)));
    return (_jsxs(Sheet, { title: t.sec.logTitle, onClose: onClose, wide: true, children: [_jsx("div", { className: "seg", role: "tablist", "aria-label": t.sec.filterAria, children: FILTERS.map((f) => (_jsx("button", { type: "button", role: "tab", id: `dla-log-filter-${f}`, "aria-selected": filter === f, tabIndex: filter === f ? 0 : -1, onClick: () => setFilter(f), onKeyDown: (e) => {
                        // 方向键 / Home / End 在三个筛选间移动（只有选中的那个在 Tab 顺序里）。
                        const i = FILTERS.indexOf(filter);
                        const next = e.key === 'ArrowRight'
                            ? FILTERS[(i + 1) % FILTERS.length]
                            : e.key === 'ArrowLeft'
                                ? FILTERS[(i - 1 + FILTERS.length) % FILTERS.length]
                                : e.key === 'Home'
                                    ? FILTERS[0]
                                    : e.key === 'End'
                                        ? FILTERS[FILTERS.length - 1]
                                        : undefined;
                        if (next === undefined)
                            return;
                        e.preventDefault();
                        setFilter(next);
                        document.getElementById(`dla-log-filter-${next}`)?.focus();
                    }, children: t.sec.filter[f] }, f))) }), _jsx("div", { className: "group log-list", children: shown.length === 0 ? (_jsx("div", { className: "empty", children: _jsx("p", { children: t.sec.logEmpty }) })) : (shown.map((e, i) => _jsx(LogRow, { e: e, full: true }, `${e.ts}-${i}`))) }), _jsx("div", { className: "sheet-actions", children: _jsx("button", { type: "button", className: "btn primary", onClick: onClose, children: t.sec.done }) })] }));
}
