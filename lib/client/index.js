import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ERROR_CODES } from "../shared.js";
import { zh as t } from "./strings.js";
import { DevicesPanel } from "./devices-panel.js";
import { SecurityPanel } from "./security-panel.js";
import { AboutPanel } from "./about-panel.js";
import { isOverlay, pickLanAddress } from "./lan-address.js";
import { BangIcon, CheckIcon, CopyIcon, InfoIcon, RowDesc, Switch, WarnIcon, WifiIcon, copyText, failureText, getStatus, useGuardedSwitch, useMounted, useSave, TOAST_MS, useSelectSetting, } from "./ui.js";
import { css, ROOT_CLASS } from "./styles.js";
export const inject = ['slots'];
const SECTION_ID = 'remote-access';
/** 带「撤销」的提示条停留更久，来得及点。 */
const UNDO_TOAST_MS = 5000;
/** 端口「已保存」绿字停留时长。 */
const PORT_SAVED_MS = 2500;
/** 设置页开着时多久刷新一次状态（已登录数、第一台设备连上后收起防火墙提示）。 */
const POLL_MS = 5000;
/** 本机看到全部四段；局域网设备只读，「设备」「安全」两段不出现（那里没有它能看的东西）。 */
const LOCAL_TABS = ['conn', 'dev', 'sec', 'about'];
const REMOTE_TABS = ['conn', 'about'];
export function RemoteAccessSection(_props) {
    const [status, setStatus] = useState();
    const [firstLoadFailed, setFirstLoadFailed] = useState(false);
    const [tab, setTab] = useState('conn');
    const [toast, setToast] = useState();
    /** 总开关点下去、还没从服务端读回来时的值（让下方立即变暗或恢复）。 */
    const [pendingEnabled, setPendingEnabled] = useState();
    const toastTimer = useRef(undefined);
    const loadSeq = useRef(0);
    const hasStatus = useRef(false);
    /** 定时刷新失败已经提示过了（恢复后清掉），免得每 5 秒弹一次。 */
    const pollWarned = useRef(false);
    /** 总开关正在保存：这期间读回来的状态是保存之前的，不用它覆盖刚翻过去的开关。 */
    const masterInFlight = useRef(false);
    const mounted = useMounted();
    const showToast = useCallback((next) => {
        if (!mounted.current)
            return;
        clearTimeout(toastTimer.current);
        setToast(next);
        toastTimer.current = setTimeout(() => setToast(undefined), next.undo ? UNDO_TOAST_MS : TOAST_MS);
    }, [mounted]);
    /** 读状态，只用最新一次的结果。读失败时保留旧内容并提示（定时刷新失败只提示一次）。 */
    const read = useCallback(async (poll) => {
        const seq = ++loadSeq.current;
        const st = await getStatus();
        if (!mounted.current || seq !== loadSeq.current || masterInFlight.current)
            return;
        if (st !== undefined) {
            hasStatus.current = true;
            pollWarned.current = false;
            setStatus(st);
            setPendingEnabled(undefined);
            setFirstLoadFailed(false);
        }
        else if (!hasStatus.current) {
            setFirstLoadFailed(true);
        }
        else if (!poll) {
            showToast({ kind: 'bad', text: t.errors.refreshFailed });
        }
        else if (!pollWarned.current) {
            pollWarned.current = true;
            showToast({ kind: 'bad', text: t.errors.pollFailed });
        }
    }, [mounted, showToast]);
    const load = useCallback(() => read(false), [read]);
    useEffect(() => {
        void load();
        const timer = setInterval(() => void read(true), POLL_MS);
        return () => clearInterval(timer);
    }, [load, read]);
    useEffect(() => () => clearTimeout(toastTimer.current), []);
    const [masterBusy, saveMaster, masterSaving] = useSave(load);
    const enabled = pendingEnabled ?? status?.enabled ?? false;
    const toggleMaster = async (next) => {
        // 上一次还在保存：这次点击整个忽略，开关也不翻，免得界面和服务端对不上。
        if (masterSaving())
            return;
        setPendingEnabled(next);
        // 点击前已经发出、还没回来的那次定时刷新作废，保存期间回来的读取也不用。
        masterInFlight.current = true;
        loadSeq.current += 1;
        const result = await saveMaster({ enabled: next });
        masterInFlight.current = false;
        if (!mounted.current)
            return;
        if (result === undefined || result.ok) {
            void load();
            return;
        }
        setPendingEnabled(undefined);
        showToast({ kind: 'bad', text: failureText(result) });
    };
    const tabs = status?.local === true ? LOCAL_TABS : REMOTE_TABS;
    const onTabKey = (e) => {
        const i = tabs.indexOf(tab);
        let next;
        if (e.key === 'ArrowRight')
            next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft')
            next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home')
            next = tabs[0];
        else if (e.key === 'End')
            next = tabs[tabs.length - 1];
        if (next === undefined)
            return;
        e.preventDefault();
        setTab(next);
        document.getElementById(`dla-tab-${next}`)?.focus();
    };
    const local = status?.local === true;
    return (_jsxs("div", { className: ROOT_CLASS, "data-dla-root": "", children: [_jsx("style", { children: css }), _jsx(Hero, { status: status, enabled: enabled, firstLoadFailed: firstLoadFailed, busy: masterBusy, onToggle: (v) => void toggleMaster(v) }), status?.fault === true && enabled && (_jsxs("div", { className: "notice bad", role: "alert", children: [_jsx(WarnIcon, {}), _jsxs("div", { className: "notice-body", children: [_jsx("b", { children: faultTitle(status) }), _jsx("span", { children: t.fault.body }), tab !== 'about' && (_jsx("button", { type: "button", className: "btn plain sm notice-link", onClick: () => {
                                    // 按钮切过去就没了：焦点放到「关于」分段上，键盘用户不会掉到页面最外层。
                                    setTab('about');
                                    requestAnimationFrame(() => document.getElementById('dla-tab-about')?.focus());
                                }, children: t.fault.more }))] })] })), status !== undefined && !local && (_jsxs("div", { className: "notice", role: "note", children: [_jsx(InfoIcon, {}), _jsxs("div", { children: [_jsx("b", { children: t.readOnly.title }), t.readOnly.body(status.clientIp ?? t.readOnly.thisDevice, status.machineName || t.readOnly.thisMachine)] })] })), status !== undefined && (_jsxs(_Fragment, { children: [_jsx("div", { className: "seg", role: "tablist", "aria-label": t.tabs.aria, children: tabs.map((id) => (_jsxs("button", { type: "button", role: "tab", id: `dla-tab-${id}`, "aria-selected": tab === id, "aria-controls": `dla-panel-${id}`, tabIndex: tab === id ? 0 : -1, onClick: () => setTab(id), onKeyDown: onTabKey, children: [t.tabs[id], id === 'about' && status.update?.state === 'available' && (_jsx("span", { className: "dot acc", role: "img", "aria-label": t.about.update.dot }))] }, id))) }), _jsx(TabPanel, { id: "conn", current: tab, children: _jsx(ConnPanel, { status: status, enabled: enabled, onChanged: load, showToast: showToast }) }), _jsx(TabPanel, { id: "dev", current: tab, children: _jsx(DevicesPanel, { local: local, showToast: showToast, onChanged: load, active: tab === 'dev' }) }), _jsx(TabPanel, { id: "sec", current: tab, children: local && (_jsx(SecurityPanel, { status: status, onChanged: load, showToast: showToast, active: tab === 'sec' })) }), _jsx(TabPanel, { id: "about", current: tab, children: _jsx(AboutPanel, { status: status, active: tab === 'about', onChanged: load, showToast: showToast }) })] })), _jsx("div", { className: "toast-live", role: "status", "aria-live": "polite", children: toast?.text ?? '' }), toast !== undefined && (_jsxs("div", { className: `toast ${toast.kind}${toast.undo ? ' has-undo' : ''}`, children: [toast.kind !== 'plain' && (_jsx("span", { className: "ico", children: toast.kind === 'ok' ? _jsx(CheckIcon, {}) : _jsx(BangIcon, {}) })), _jsx("span", { children: toast.text }), toast.undo && (_jsx("button", { type: "button", className: "btn plain sm", onClick: () => {
                            toast.undo?.();
                            clearTimeout(toastTimer.current);
                            setToast(undefined);
                        }, children: t.undo }))] }))] }));
}
/** 分段面板一直挂着，不是当前段就 hidden：切换分段不会打断保存中的操作，aria-controls 也总指向真元素。 */
function TabPanel({ id, current, children, }) {
    return (_jsx("div", { className: "panel", role: "tabpanel", id: `dla-panel-${id}`, "aria-labelledby": `dla-tab-${id}`, hidden: current !== id, children: children }));
}
/** 红条标题：第一项没通过的检查。 */
function faultTitle(status) {
    const first = status.checks.find((c) => c.state === 'bad' || c.state === 'warn');
    return (first && t.fault.title[first.id]) ?? t.fault.title.signing;
}
function Hero({ status, enabled, firstLoadFailed, busy, onToggle, }) {
    let sub;
    if (status === undefined) {
        sub = _jsx(_Fragment, { children: firstLoadFailed ? t.hero.unreachable : t.hero.loading });
    }
    else if (!enabled) {
        sub = (_jsxs(_Fragment, { children: [_jsx("span", { className: "dot" }), t.hero.disabled] }));
    }
    else if (status.fault) {
        sub = (_jsxs(_Fragment, { children: [_jsx("span", { className: "dot bad" }), t.hero.fault] }));
    }
    else if (status.checkedAt === null) {
        sub = _jsx(_Fragment, { children: t.hero.checking });
    }
    else {
        const parts = [t.hero.running];
        if (status.lanEnabled) {
            parts.push(t.hero.lanOpen);
            if (status.loggedIn !== undefined)
                parts.push(t.hero.loggedIn(status.loggedIn));
        }
        else
            parts.push(t.hero.localOnly);
        sub = (_jsxs(_Fragment, { children: [_jsx("span", { className: "dot ok" }), parts.join(' · ')] }));
    }
    return (_jsxs("section", { className: `hero${status !== undefined && !enabled ? ' off' : status?.fault === true ? ' fault' : ''}`, children: [_jsx("div", { className: "hero-icon", children: _jsx(WifiIcon, {}) }), _jsxs("div", { className: "hero-body", children: [_jsx("h1", { className: "hero-title", children: t.title }), _jsx("p", { className: "hero-sub", children: sub })] }), status?.local === true && (_jsx(Switch, { checked: enabled, label: t.hero.switchLabel, busy: busy, onToggle: onToggle }))] }));
}
/** 局域网访问地址里用哪个 IP：选了网卡就用它，否则自动挑一个。 */
function preferredAddress(status) {
    if (status.lan.host !== '')
        return status.lan.host;
    return pickLanAddress(status.lanIps ?? []);
}
function ConnPanel({ status, enabled, onChanged, showToast, }) {
    const groupRef = useRef(null);
    const lanGroupRef = useRef(null);
    const dim = !enabled;
    const localUrl = `http://127.0.0.1:${status.port}`;
    const local = useGuardedSwitch(status.allowLoopback, 'allowLoopback', onChanged, showToast, (f) => f.kind === 'rejected' && f.code === ERROR_CODES.passwordRequired
        ? t.conn.needPassword
        : undefined);
    const lan = useGuardedSwitch(status.lanEnabled, 'lanEnabled', onChanged, showToast, (f) => {
        if (f.kind !== 'rejected')
            return undefined;
        if (f.code === ERROR_CODES.passwordRequired)
            return t.conn.needPassword;
        if (f.code === ERROR_CODES.portInUse)
            return t.conn.lanPortInUse(f.port ?? status.lan.port);
        if (f.code === ERROR_CODES.hostUnavailable)
            return t.conn.lanHostUnavailable;
        return undefined;
    });
    // 变暗时整组不可操作：鼠标、键盘、读屏都进不去。
    useEffect(() => {
        if (groupRef.current)
            groupRef.current.inert = dim;
        if (lanGroupRef.current)
            lanGroupRef.current.inert = dim;
    }, [dim, lan.checked]);
    const copy = async (url, done) => {
        const ok = await copyText(url);
        showToast(ok ? { kind: 'ok', text: done } : { kind: 'bad', text: t.conn.copyFailed });
    };
    const showLanEntry = status.lanEnabled && lan.checked;
    // 局域网设备只读，只列三行；本机地址和访问地址对它没用，不显示。
    if (!status.local)
        return (_jsx("div", { className: "group-wrap", children: _jsxs("div", { className: "group", children: [_jsxs("div", { className: "row", children: [_jsx("div", { className: "row-main", children: _jsx("p", { className: "row-label", children: t.conn.localLabel }) }), _jsx("span", { className: "row-value", children: status.allowLoopback ? t.readOnly.on : t.readOnly.off })] }), _jsxs("div", { className: "row", children: [_jsx("div", { className: "row-main", children: _jsx("p", { className: "row-label", children: t.conn.lanLabel }) }), _jsx("span", { className: "row-value", children: status.lanEnabled ? t.readOnly.on : t.readOnly.off })] }), status.lanEnabled && (_jsxs("div", { className: "row", children: [_jsx("div", { className: "row-main", children: _jsx("p", { className: "row-label", children: t.conn.portLabel }) }), _jsx("span", { className: "row-value mono", children: status.lan.port })] }))] }) }));
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "group-wrap", children: [_jsxs("div", { ref: groupRef, className: `group${dim ? ' dim' : ''}`, children: [_jsxs("div", { className: "row", children: [_jsxs("div", { className: "row-main", children: [_jsx("p", { className: "row-label", children: t.conn.localLabel }), _jsx(RowDesc, { text: t.conn.localDesc, alert: local.inlineError ? { kind: 'bad', text: local.inlineError } : undefined }), _jsxs("p", { className: "row-addr", children: [_jsx("span", { className: "mono", children: localUrl }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": t.conn.copyLocal, title: t.conn.copyLocal, onClick: () => void copy(localUrl, t.conn.copied), children: _jsx(CopyIcon, {}) })] })] }), _jsx(Switch, { checked: local.checked, label: t.conn.localLabel, busy: local.busy, onToggle: local.toggle })] }), _jsxs("div", { className: "row", children: [_jsxs("div", { className: "row-main", children: [_jsx("p", { className: "row-label", children: t.conn.lanLabel }), _jsx(RowDesc, { text: t.conn.lanDesc, alert: lan.inlineError ? { kind: 'bad', text: lan.inlineError } : undefined })] }), _jsx(Switch, { checked: lan.checked, label: t.conn.lanLabel, busy: lan.busy, onToggle: lan.toggle })] })] }), dim && _jsx("p", { className: "group-foot", children: t.hero.keptWhileOff })] }), showLanEntry && (_jsxs("div", { ref: lanGroupRef, className: "panel", children: [status.lan.listening && !status.lan.hintDone && (_jsxs("div", { className: "notice", role: "note", children: [_jsx(InfoIcon, {}), _jsxs("div", { children: [_jsx("b", { children: t.conn.firewallTitle }), t.conn.firewallBody] })] })), _jsx(LanEntry, { status: status, dim: dim, onChanged: onChanged, showToast: showToast, copy: copy })] }))] }));
}
function LanEntry({ status, dim, onChanged, showToast, copy, }) {
    const [portText, setPortText] = useState(String(status.lan.port));
    const [portAlert, setPortAlert] = useState();
    const [nicAlert, setNicAlert] = useState();
    const alertTimer = useRef(undefined);
    const mounted = useMounted();
    const [, savePort, portSaving] = useSave(onChanged);
    useEffect(() => setPortText(String(status.lan.port)), [status.lan.port]);
    useEffect(() => () => clearTimeout(alertTimer.current), []);
    const address = preferredAddress(status);
    const lanUrl = address ? `http://${address}:${status.lan.port}` : undefined;
    const flashPort = (alert, ms) => {
        clearTimeout(alertTimer.current);
        setPortAlert(alert);
        alertTimer.current = setTimeout(() => {
            if (mounted.current)
                setPortAlert(undefined);
        }, ms);
    };
    /** 端口：回车或离开输入框时生效；不合法原地报错，不发请求。 */
    const commitPort = async () => {
        const text = portText.trim();
        if (text === String(status.lan.port) || portSaving())
            return;
        const port = Number(text);
        if (!/^\d+$/.test(text) || port < 1 || port > 65535) {
            setPortAlert({ kind: 'bad', text: t.conn.portInvalid });
            return;
        }
        if (port === status.port) {
            setPortAlert({ kind: 'bad', text: t.conn.portIsMain(port) });
            return;
        }
        const result = await savePort({ lanPort: port });
        if (result === undefined || !mounted.current)
            return;
        if (result.ok) {
            flashPort({ kind: 'ok', text: t.conn.portSaved }, PORT_SAVED_MS);
            return;
        }
        if (result.kind === 'rejected' && result.code === ERROR_CODES.portInUse)
            setPortAlert({ kind: 'bad', text: t.conn.portInUse(port) });
        else if (result.kind === 'rejected' && result.code === ERROR_CODES.invalidPort)
            setPortAlert({ kind: 'bad', text: t.conn.portIsMain(port) });
        else
            showToast({ kind: 'bad', text: failureText(result) });
    };
    // 网卡：选完立刻显示新值，以最后一次为准；端口被占、网卡不在了原地说原因。
    const [nicValue, changeNic] = useSelectSetting(status.lan.host, 'lanHost', onChanged, showToast, (f) => {
        if (f.kind === 'rejected' && f.code === ERROR_CODES.portInUse) {
            setNicAlert(t.conn.portInUse(status.lan.port));
            return true;
        }
        if (f.kind === 'rejected' && f.code === ERROR_CODES.hostUnavailable) {
            setNicAlert(t.conn.nicMissing);
            return true;
        }
        return false;
    });
    const ips = status.lanIps ?? [];
    const nicMissingNow = status.lan.hostMissing || status.lan.error === 'host-unavailable';
    return (_jsxs("div", { className: "group-wrap", children: [_jsx("h2", { className: "group-head", children: t.conn.lanGroup }), _jsxs("div", { className: `group${dim ? ' dim' : ''}`, children: [_jsxs("div", { className: "row", children: [_jsx("div", { className: "row-main", children: _jsx("p", { className: "row-label", children: t.conn.addrLabel }) }), lanUrl !== undefined ? (_jsxs("div", { className: "row-end addr", children: [_jsx("span", { className: "mono", children: lanUrl }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": t.conn.copyLan, title: t.conn.copyLan, onClick: () => void copy(lanUrl, t.conn.copiedLan), children: _jsx(CopyIcon, {}) })] })) : (_jsx("span", { className: "row-value", children: t.conn.nicNoNetwork }))] }), _jsxs("div", { className: "row", children: [_jsxs("div", { className: "row-main", children: [_jsx("p", { className: "row-label", children: t.conn.nicLabel }), _jsx(RowDesc, { text: t.conn.nicDesc, alert: nicAlert !== undefined
                                            ? { kind: 'bad', text: nicAlert }
                                            : nicMissingNow
                                                ? { kind: 'bad', text: t.conn.nicMissing }
                                                : undefined })] }), _jsxs("select", { className: "select", "aria-label": t.conn.nicLabel, value: nicValue, onChange: (e) => {
                                    setNicAlert(undefined);
                                    changeNic(e.target.value);
                                }, children: [_jsx("option", { value: "", children: t.conn.nicAll }), ips.map((i) => (_jsx("option", { value: i.address, children: isOverlay(i.address)
                                            ? `${i.name} · ${t.conn.nicOverlay} · ${i.address}`
                                            : `${i.name} · ${i.address}` }, `${i.name}-${i.address}`))), status.lan.host !== '' && !ips.some((i) => i.address === status.lan.host) && (_jsx("option", { value: status.lan.host, children: status.lan.host }))] })] }), _jsxs("div", { className: "row", children: [_jsxs("div", { className: "row-main", children: [_jsx("p", { className: "row-label", children: t.conn.portLabel }), _jsx(RowDesc, { text: t.conn.portDesc, alert: portAlert ??
                                            (status.lan.error === 'port-in-use'
                                                ? { kind: 'bad', text: t.conn.portInUse(status.lan.port) }
                                                : undefined) })] }), _jsx("input", { className: "field num", inputMode: "numeric", "aria-label": t.conn.portLabel, "aria-invalid": portAlert?.kind === 'bad' || undefined, value: portText, onChange: (e) => {
                                    setPortText(e.target.value);
                                    if (portAlert?.kind === 'bad')
                                        setPortAlert(undefined);
                                }, onKeyDown: (e) => {
                                    if (e.key === 'Enter')
                                        void commitPort();
                                    // 正在改端口时按 Esc 只撤销这次输入，不关设置窗口；没在改时交给 dsh 关窗口。
                                    if (e.key === 'Escape' && (portText !== String(status.lan.port) || portAlert)) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.nativeEvent.stopImmediatePropagation();
                                        setPortText(String(status.lan.port));
                                        setPortAlert(undefined);
                                    }
                                }, onBlur: () => void commitPort() })] })] }), _jsxs("p", { className: "group-foot warn", children: [_jsx(WarnIcon, {}), _jsx("span", { children: t.conn.insecure })] })] }));
}
export function apply(ctx) {
    const slots = ctx.slots;
    slots?.inject('settings.section', () => slots.register({
        name: 'settings.section',
        id: SECTION_ID,
        order: 100,
        label: () => t.sectionLabel,
    }, RemoteAccessSection));
}
