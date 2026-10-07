import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { zh as t } from "./strings.js";
import { BangSmallIcon, CheckSmallIcon, DashSmallIcon, Spinner, XSmallIcon, ago, failureText, getJson, postJson, useMounted, } from "./ui.js";
function checkDesc(c) {
    const s = t.about.check;
    switch (c.id) {
        case 'webServer':
            return c.state === 'ok' ? s.webServer.ok(c.port ?? 0) : s.webServer.bad;
        case 'signing':
            return c.state === 'ok' ? s.signing.ok : s.signing.bad;
        case 'sessionKey':
            return c.state === 'ok' ? s.sessionKey.ok : s.sessionKey.bad;
        case 'dshVersion':
            if (c.version == null)
                return s.dshVersion.unknown;
            return c.state === 'ok' ? s.dshVersion.ok(c.version) : s.dshVersion.warn(c.version);
        case 'password':
            return c.state === 'ok' ? s.password.ok : s.password.idle;
    }
}
export function CheckIcon({ state }) {
    const icon = state === 'ok' ? (_jsx(CheckSmallIcon, {})) : state === 'bad' ? (_jsx(XSmallIcon, {})) : state === 'warn' ? (_jsx(BangSmallIcon, {})) : (_jsx(DashSmallIcon, {}));
    return (_jsx("span", { className: `chk ${state}`, role: "img", "aria-label": t.about.stateLabel[state], children: icon }));
}
/** 没通过（含版本超范围）/ 通过 / 中性各几项。 */
function tally(checks) {
    const n = (f) => checks.filter(f).length;
    return {
        failed: n((c) => c.state === 'bad' || c.state === 'warn'),
        ok: n((c) => c.state === 'ok'),
        idle: n((c) => c.state === 'idle'),
    };
}
function CheckRow({ c }) {
    return (_jsxs("div", { className: "row", children: [_jsx(CheckIcon, { state: c.state }), _jsxs("div", { className: "row-main", children: [_jsx("p", { className: "row-label", children: t.about.check[c.id].label }), _jsx("p", { className: `row-desc${c.state === 'bad' ? ' bad' : ''}`, children: checkDesc(c) })] })] }));
}
/** 插件这一行：说明 + 按钮随更新状态变。 */
function UpdateRow({ update, onCheck, onUpdate, }) {
    const u = t.about.update;
    let desc;
    let action = null;
    switch (update.state) {
        case 'idle':
        case 'checking':
            desc = (_jsxs(_Fragment, { children: [_jsx(Spinner, {}), u.checking] }));
            break;
        case 'latest':
            desc = (_jsxs(_Fragment, { children: [_jsx("span", { className: "dot ok" }), u.latest(update.current)] }));
            action = (_jsx("button", { type: "button", className: "btn sm", onClick: onCheck, children: u.check }));
            break;
        case 'unavailable':
            desc = _jsx(_Fragment, { children: u.unavailable(update.current) });
            action = (_jsx("button", { type: "button", className: "btn sm", onClick: onCheck, children: u.check }));
            break;
        case 'available': {
            const [head, tail] = u.available(update.current, update.latest ?? '');
            desc = (_jsxs(_Fragment, { children: [head, _jsx("span", { className: "acc-text", children: tail })] }));
            action = (_jsx("button", { type: "button", className: "btn primary sm", onClick: onUpdate, children: u.to(update.latest ?? '') }));
            break;
        }
        case 'running':
            desc = _jsx(_Fragment, { children: u.running });
            action = (_jsxs("button", { type: "button", className: "btn primary sm", "aria-busy": "true", disabled: true, children: [_jsx(Spinner, {}), u.busy] }));
            break;
        case 'done':
            desc = (_jsxs(_Fragment, { children: [_jsx("span", { className: "dot ok" }), u.done(update.latest ?? '')] }));
            break;
        case 'failed':
            desc = (_jsx(_Fragment, { children: update.reason === 'no-command'
                    ? u.failed['no-command'](update.command ?? '')
                    : u.failed[update.reason ?? 'failed'] }));
            action = (_jsx("button", { type: "button", className: "btn sm", onClick: onUpdate, children: u.retry }));
            break;
    }
    return (_jsxs("div", { className: "row", children: [_jsxs("div", { className: "row-main", children: [_jsx("p", { className: "row-label", children: t.about.plugin }), _jsx("p", { className: `row-desc inline${update.state === 'failed' ? ' bad' : ''}`, "aria-live": "polite", children: desc })] }), action] }));
}
export function AboutPanel({ status, active, onChanged, showToast, }) {
    const local = status.local;
    const [update, setUpdate] = useState(status.update);
    const [rechecking, setRechecking] = useState(false);
    const mounted = useMounted();
    /** 查版本和点更新各用各的序号：更新进行中切走再切回来查一次，不能把更新的结果作废。 */
    const checkSeq = useRef(0);
    // 更新在服务端跑，界面靠轮询状态跟着变。
    const serverUpdate = status.update;
    useEffect(() => {
        if (serverUpdate === undefined)
            return;
        if (serverUpdate.state === 'done' || serverUpdate.state === 'failed')
            setUpdate((u) => (u?.state === 'running' ? serverUpdate : u));
    }, [serverUpdate]);
    const check = async () => {
        const n = ++checkSeq.current;
        setUpdate({ state: 'checking', current: status.version });
        const next = await getJson('update');
        if (!mounted.current || n !== checkSeq.current)
            return;
        setUpdate(next ?? { state: 'unavailable', current: status.version });
        onChanged();
    };
    // 每次打开「关于」查一次；更新正在跑或已完成时服务端直接回那次的结果。
    useEffect(() => {
        if (active && local)
            void check();
    }, [active, local]);
    const runUpdate = async () => {
        // 更新期间回来的「查版本」结果作废（它可能是点更新之前发出的）。
        checkSeq.current += 1;
        setUpdate((u) => ({ ...(u ?? { current: status.version }), state: 'running' }));
        const result = await postJson('update', {});
        if (!mounted.current)
            return;
        if (result.ok)
            setUpdate(result.data);
        else
            setUpdate((u) => ({
                ...(u ?? { current: status.version }),
                state: 'failed',
                // 请求没送到才说「连不上」，被拒按一般失败说。
                reason: result.kind === 'network' ? 'network' : 'failed',
            }));
        onChanged();
    };
    const recheck = async () => {
        if (rechecking)
            return;
        setRechecking(true);
        const result = await postJson('selfcheck', {});
        if (!mounted.current)
            return;
        setRechecking(false);
        onChanged();
        if (!result.ok) {
            showToast({ kind: 'bad', text: failureText(result) });
            return;
        }
        const checks = result.data.checks;
        const { failed, ok, idle } = tally(checks);
        showToast(failed > 0
            ? { kind: 'bad', text: t.about.toastFailed(failed) }
            : { kind: 'ok', text: idle > 0 ? t.about.toastPassedUnset(ok) : t.about.toastPassed(ok) });
    };
    const checks = status.checks;
    const { failed, ok, idle } = tally(checks);
    const versionCheck = checks.find((c) => c.id === 'dshVersion');
    const summary = failed > 0
        ? t.about.someFailed(failed)
        : idle > 0
            ? t.about.passedSomeUnset(ok, idle)
            : t.about.allPassed(ok);
    const count = status.checkedAt === null ? t.about.pending : `${summary} · ${ago(status.checkedAt)}`;
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "group-wrap", children: [_jsx("h2", { className: "group-head", children: t.about.groupVersion }), _jsxs("div", { className: "group", children: [local ? (_jsx(UpdateRow, { update: update ?? { state: 'checking', current: status.version }, onCheck: () => void check(), onUpdate: () => void runUpdate() })) : (_jsxs("div", { className: "row", children: [_jsx("div", { className: "row-main", children: _jsx("p", { className: "row-label", children: t.about.plugin }) }), _jsx("span", { className: "row-value mono", children: status.version })] })), _jsxs("div", { className: "row", children: [_jsx("div", { className: "row-main", children: _jsx("p", { className: "row-label", children: t.about.dsh }) }), _jsx("span", { className: "row-value", children: status.dshVersion === null
                                            ? t.about.unknownVersion
                                            : versionCheck?.state === 'warn'
                                                ? t.about.dshOutOfRange(status.dshVersion)
                                                : t.about.dshInRange(status.dshVersion) })] }), _jsxs("div", { className: "row", children: [_jsx("div", { className: "row-main", children: _jsx("p", { className: "row-label", children: t.about.runtime }) }), _jsxs("span", { className: "row-value", children: [t.about.edition[status.edition], " \u00B7 ", t.about.port(status.port)] })] })] })] }), _jsxs("div", { className: "group-wrap", children: [_jsxs("h2", { className: "group-head", children: [_jsxs("span", { children: [t.about.groupChecks, " ", _jsx("span", { className: "count", children: count })] }), local && (_jsxs("button", { type: "button", className: "btn plain sm", "aria-busy": rechecking || undefined, disabled: rechecking, onClick: () => void recheck(), children: [rechecking && _jsx(Spinner, {}), rechecking ? t.about.rechecking : t.about.recheck] }))] }), _jsx("div", { className: "group", children: checks.map((c) => (_jsx(CheckRow, { c: c }, c.id))) }), _jsx("p", { className: "group-foot", children: t.about.checksFoot })] })] }));
}
