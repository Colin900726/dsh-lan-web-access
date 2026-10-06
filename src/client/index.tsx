/**
 * 设置面板「局域网web访问」标签页（界面部分）。
 *
 * 按 设计稿 定稿实现：状态头（总开关）→ 分段切换 → 当前分段。
 * 分段随开发阶段逐个加入：第 1 阶段有「连接」（本机部分）和「关于」（版本与运行环境），
 * 设备、安全两段在各自阶段加入；没做的分段不出现，不留点了没反应的东西。
 * 所有读写走 `/api/remote-access/*` 普通 fetch。局域网设备打开时只读（`local === false`）。
 */

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ERROR_CODES, type RemoteAccessStatus } from '../shared.ts';
import { zh as t } from './strings.ts';
import { DevicesPanel } from './devices-panel.tsx';
import { SecurityPanel } from './security-panel.tsx';
import { AboutPanel } from './about-panel.tsx';
import { isOverlay, pickLanAddress } from './lan-address.ts';
import {
  BangIcon,
  CheckIcon,
  CopyIcon,
  InfoIcon,
  RowDesc,
  Switch,
  WarnIcon,
  WifiIcon,
  copyText,
  failureText,
  getStatus,
  useGuardedSwitch,
  useMounted,
  useSave,
  TOAST_MS,
  type Toast,
} from './ui.tsx';
import { css, ROOT_CLASS } from './styles.ts';

export const inject = ['slots'];

const SECTION_ID = 'remote-access';
/** 带「撤销」的提示条停留更久，来得及点。 */
const UNDO_TOAST_MS = 5000;

/** 端口「已保存」绿字停留时长（设计规范：2.5 秒）。 */
const PORT_SAVED_MS = 2500;
/** 设置页开着时多久刷新一次状态（已登录数、第一台设备连上后收起防火墙提示）。 */
const POLL_MS = 5000;

type Status = RemoteAccessStatus;
type Tab = 'conn' | 'dev' | 'sec' | 'about';
/** 本机看到全部四段；局域网设备只读，「设备」「安全」两段不出现（那里没有它能看的东西）。 */
const LOCAL_TABS: readonly Tab[] = ['conn', 'dev', 'sec', 'about'];
const REMOTE_TABS: readonly Tab[] = ['conn', 'about'];
export function RemoteAccessSection(_props: PropsRuntime<'settings.section'>): ReactElement {
  const [status, setStatus] = useState<Status | undefined>();
  const [firstLoadFailed, setFirstLoadFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('conn');
  const [toast, setToast] = useState<Toast | undefined>();
  /** 总开关点下去、还没从服务端读回来时的值（让下方立即变暗或恢复）。 */
  const [pendingEnabled, setPendingEnabled] = useState<boolean | undefined>();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadSeq = useRef(0);
  const hasStatus = useRef(false);
  /** 定时刷新失败已经提示过了（恢复后清掉），免得每 5 秒弹一次。 */
  const pollWarned = useRef(false);
  /** 总开关正在保存：这期间读回来的状态是保存之前的，不用它覆盖刚翻过去的开关。 */
  const masterInFlight = useRef(false);
  const mounted = useMounted();

  const showToast = useCallback(
    (next: Toast) => {
      if (!mounted.current) return;
      clearTimeout(toastTimer.current);
      setToast(next);
      toastTimer.current = setTimeout(
        () => setToast(undefined),
        next.undo ? UNDO_TOAST_MS : TOAST_MS,
      );
    },
    [mounted],
  );

  /**
   * 读状态。只采用最新一次读取的结果；已经有状态时读失败就保留旧状态、提示一句：
   * 保存之后刷新失败说「已保存，但没能刷新」；定时刷新失败只说一次「连不上 dsh」，恢复后再出问题才再说。
   */
  const read = useCallback(
    async (poll: boolean) => {
      const seq = ++loadSeq.current;
      const st = await getStatus();
      if (!mounted.current || seq !== loadSeq.current || masterInFlight.current) return;
      if (st !== undefined) {
        hasStatus.current = true;
        pollWarned.current = false;
        setStatus(st);
        setPendingEnabled(undefined);
        setFirstLoadFailed(false);
      } else if (!hasStatus.current) {
        setFirstLoadFailed(true);
      } else if (!poll) {
        showToast({ kind: 'bad', text: t.errors.refreshFailed });
      } else if (!pollWarned.current) {
        pollWarned.current = true;
        showToast({ kind: 'bad', text: t.errors.pollFailed });
      }
    },
    [mounted, showToast],
  );
  const load = useCallback(() => read(false), [read]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void read(true), POLL_MS);
    return () => clearInterval(timer);
  }, [load, read]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const [masterBusy, saveMaster, masterSaving] = useSave(load);
  const enabled = pendingEnabled ?? status?.enabled ?? false;

  const toggleMaster = async (next: boolean): Promise<void> => {
    // 上一次还在保存：这次点击整个忽略，开关也不翻，免得界面和服务端对不上。
    if (masterSaving()) return;
    setPendingEnabled(next);
    // 点击前已经发出、还没回来的那次定时刷新作废，保存期间回来的读取也不用。
    masterInFlight.current = true;
    loadSeq.current += 1;
    const result = await saveMaster({ enabled: next });
    masterInFlight.current = false;
    if (!mounted.current) return;
    if (result === undefined || result.ok) {
      void load();
      return;
    }
    setPendingEnabled(undefined);
    showToast({ kind: 'bad', text: failureText(result) });
  };

  const tabs = status?.local === true ? LOCAL_TABS : REMOTE_TABS;

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const i = tabs.indexOf(tab);
    let next: Tab | undefined;
    if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
    else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === 'Home') next = tabs[0];
    else if (e.key === 'End') next = tabs[tabs.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    setTab(next);
    document.getElementById(`dla-tab-${next}`)?.focus();
  };

  const local = status?.local === true;

  return (
    <div className={ROOT_CLASS} data-dla-root="">
      <style>{css}</style>
      <Hero
        status={status}
        enabled={enabled}
        firstLoadFailed={firstLoadFailed}
        busy={masterBusy}
        onToggle={(v) => void toggleMaster(v)}
      />

      {status?.fault === true && enabled && (
        <div className="notice bad" role="alert">
          <WarnIcon />
          <div className="notice-body">
            <b>{faultTitle(status)}</b>
            <span>{t.fault.body}</span>
            {tab !== 'about' && (
              <button
                type="button"
                className="btn plain sm notice-link"
                onClick={() => {
                  // 按钮切过去就没了：焦点放到「关于」分段上，键盘用户不会掉到页面最外层。
                  setTab('about');
                  requestAnimationFrame(() => document.getElementById('dla-tab-about')?.focus());
                }}
              >
                {t.fault.more}
              </button>
            )}
          </div>
        </div>
      )}

      {status !== undefined && !local && (
        <div className="notice" role="note">
          <InfoIcon />
          <div>
            <b>{t.readOnly.title}</b>
            {t.readOnly.body(
              status.clientIp ?? t.readOnly.thisDevice,
              status.machineName || t.readOnly.thisMachine,
            )}
          </div>
        </div>
      )}

      {status !== undefined && (
        <>
          <div className="seg" role="tablist" aria-label={t.tabs.aria}>
            {tabs.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`dla-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`dla-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={onTabKey}
              >
                {t.tabs[id]}
                {id === 'about' && status.update?.state === 'available' && (
                  <span className="dot acc" role="img" aria-label={t.about.update.dot} />
                )}
              </button>
            ))}
          </div>
          <TabPanel id="conn" current={tab}>
            <ConnPanel status={status} enabled={enabled} onChanged={load} showToast={showToast} />
          </TabPanel>
          <TabPanel id="dev" current={tab}>
            <DevicesPanel
              local={local}
              showToast={showToast}
              onChanged={load}
              active={tab === 'dev'}
            />
          </TabPanel>
          <TabPanel id="sec" current={tab}>
            {local && (
              <SecurityPanel
                status={status}
                onChanged={load}
                showToast={showToast}
                active={tab === 'sec'}
              />
            )}
          </TabPanel>
          <TabPanel id="about" current={tab}>
            <AboutPanel
              status={status}
              active={tab === 'about'}
              onChanged={load}
              showToast={showToast}
            />
          </TabPanel>
        </>
      )}

      {/* 读屏的播报区一直挂着、只换里面的内容：跟着内容一起挂上去的 live 区常常不念。 */}
      <div className="toast-live" role="status" aria-live="polite">
        {toast?.text ?? ''}
      </div>
      {toast !== undefined && (
        <div className={`toast ${toast.kind}${toast.undo ? ' has-undo' : ''}`}>
          {toast.kind !== 'plain' && (
            <span className="ico">{toast.kind === 'ok' ? <CheckIcon /> : <BangIcon />}</span>
          )}
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className="btn plain sm"
              onClick={() => {
                toast.undo?.();
                clearTimeout(toastTimer.current);
                setToast(undefined);
              }}
            >
              {t.undo}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 分段面板一直挂着，不是当前段就 hidden：切换分段不会打断保存中的操作，aria-controls 也总指向真元素。 */
function TabPanel({
  id,
  current,
  children,
}: {
  id: Tab;
  current: Tab;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      className="panel"
      role="tabpanel"
      id={`dla-panel-${id}`}
      aria-labelledby={`dla-tab-${id}`}
      hidden={current !== id}
    >
      {children}
    </div>
  );
}

/** 红条标题：第一项没通过的检查。 */
function faultTitle(status: Status): string {
  const first = status.checks.find((c) => c.state === 'bad' || c.state === 'warn');
  return (first && t.fault.title[first.id]) ?? t.fault.title.signing!;
}

function Hero({
  status,
  enabled,
  firstLoadFailed,
  busy,
  onToggle,
}: {
  status: Status | undefined;
  enabled: boolean;
  firstLoadFailed: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}): ReactElement {
  let sub: ReactElement;
  if (status === undefined) {
    sub = <>{firstLoadFailed ? t.hero.unreachable : t.hero.loading}</>;
  } else if (!enabled) {
    sub = (
      <>
        <span className="dot" />
        {t.hero.disabled}
      </>
    );
  } else if (status.fault) {
    sub = (
      <>
        <span className="dot bad" />
        {t.hero.fault}
      </>
    );
  } else if (status.checkedAt === null) {
    sub = <>{t.hero.checking}</>;
  } else {
    const parts: string[] = [t.hero.running];
    if (status.lanEnabled) {
      parts.push(t.hero.lanOpen);
      if (status.loggedIn !== undefined) parts.push(t.hero.loggedIn(status.loggedIn));
    } else parts.push(t.hero.localOnly);
    sub = (
      <>
        <span className="dot ok" />
        {parts.join(' · ')}
      </>
    );
  }

  return (
    <section
      className={`hero${status !== undefined && !enabled ? ' off' : status?.fault === true ? ' fault' : ''}`}
    >
      <div className="hero-icon">
        <WifiIcon />
      </div>
      <div className="hero-body">
        <h1 className="hero-title">{t.title}</h1>
        <p className="hero-sub" role="status">
          {sub}
        </p>
      </div>
      {status?.local === true && (
        <Switch checked={enabled} label={t.hero.switchLabel} busy={busy} onToggle={onToggle} />
      )}
    </section>
  );
}

/** 一个保存后可能被拒的开关行：乐观翻转，被拒弹回；需要原地红字的原因给出文字，其余走提示条。 */
function preferredAddress(status: Status): string | undefined {
  if (status.lan.host !== '') return status.lan.host;
  return pickLanAddress(status.lanIps ?? []);
}

function ConnPanel({
  status,
  enabled,
  onChanged,
  showToast,
}: {
  status: Status;
  enabled: boolean;
  onChanged: () => void;
  showToast: (t: Toast) => void;
}): ReactElement {
  const groupRef = useRef<HTMLDivElement>(null);
  const lanGroupRef = useRef<HTMLDivElement>(null);
  const dim = !enabled;
  const localUrl = `http://127.0.0.1:${status.port}`;

  const local = useGuardedSwitch(
    status.allowLoopback,
    'allowLoopback',
    onChanged,
    showToast,
    (f) =>
      f.kind === 'rejected' && f.code === ERROR_CODES.passwordRequired
        ? t.conn.needPassword
        : undefined,
  );
  const lan = useGuardedSwitch(status.lanEnabled, 'lanEnabled', onChanged, showToast, (f) => {
    if (f.kind !== 'rejected') return undefined;
    if (f.code === ERROR_CODES.passwordRequired) return t.conn.needPassword;
    if (f.code === ERROR_CODES.portInUse) return t.conn.lanPortInUse(f.port ?? status.lan.port);
    if (f.code === ERROR_CODES.hostUnavailable) return t.conn.lanHostUnavailable;
    return undefined;
  });

  // 变暗时整组不可操作：鼠标、键盘、读屏都进不去。
  useEffect(() => {
    if (groupRef.current) groupRef.current.inert = dim;
    if (lanGroupRef.current) lanGroupRef.current.inert = dim;
  }, [dim, lan.checked]);

  const copy = async (url: string, done: string): Promise<void> => {
    const ok = await copyText(url);
    showToast(ok ? { kind: 'ok', text: done } : { kind: 'bad', text: t.conn.copyFailed });
  };

  const showLanEntry = status.lanEnabled && lan.checked;

  // 局域网设备只读：按设计稿只列三行（本机免登录、局域网访问、端口）。本机地址 127.0.0.1 在别的设备上
  // 指的是那台设备自己，访问地址它正在用，都不显示，也就没有能点却没用的「复制」。
  if (!status.local)
    return (
      <div className="group-wrap">
        <div className="group">
          <div className="row">
            <div className="row-main">
              <p className="row-label">{t.conn.localLabel}</p>
            </div>
            <span className="row-value">
              {status.allowLoopback ? t.readOnly.on : t.readOnly.off}
            </span>
          </div>
          <div className="row">
            <div className="row-main">
              <p className="row-label">{t.conn.lanLabel}</p>
            </div>
            <span className="row-value">{status.lanEnabled ? t.readOnly.on : t.readOnly.off}</span>
          </div>
          {status.lanEnabled && (
            <div className="row">
              <div className="row-main">
                <p className="row-label">{t.conn.portLabel}</p>
              </div>
              <span className="row-value mono">{status.lan.port}</span>
            </div>
          )}
        </div>
      </div>
    );

  return (
    <>
      <div className="group-wrap">
        <div ref={groupRef} className={`group${dim ? ' dim' : ''}`}>
          <div className="row">
            <div className="row-main">
              <p className="row-label">{t.conn.localLabel}</p>
              <RowDesc
                text={t.conn.localDesc}
                alert={local.inlineError ? { kind: 'bad', text: local.inlineError } : undefined}
              />
              <p className="row-addr">
                <span className="mono">{localUrl}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t.conn.copyLocal}
                  title={t.conn.copyLocal}
                  onClick={() => void copy(localUrl, t.conn.copied)}
                >
                  <CopyIcon />
                </button>
              </p>
            </div>
            {status.local ? (
              <Switch
                checked={local.checked}
                label={t.conn.localLabel}
                busy={local.busy}
                onToggle={local.toggle}
              />
            ) : (
              <span className="row-value">{local.checked ? t.readOnly.on : t.readOnly.off}</span>
            )}
          </div>
          <div className="row">
            <div className="row-main">
              <p className="row-label">{t.conn.lanLabel}</p>
              <RowDesc
                text={t.conn.lanDesc}
                alert={lan.inlineError ? { kind: 'bad', text: lan.inlineError } : undefined}
              />
            </div>
            {status.local ? (
              <Switch
                checked={lan.checked}
                label={t.conn.lanLabel}
                busy={lan.busy}
                onToggle={lan.toggle}
              />
            ) : (
              <span className="row-value">{lan.checked ? t.readOnly.on : t.readOnly.off}</span>
            )}
          </div>
        </div>
        {dim && <p className="group-foot">{t.hero.keptWhileOff}</p>}
      </div>

      {showLanEntry && (
        <div ref={lanGroupRef} className="panel">
          {status.local && status.lan.listening && !status.lan.hintDone && (
            <div className="notice" role="note">
              <InfoIcon />
              <div>
                <b>{t.conn.firewallTitle}</b>
                {t.conn.firewallBody}
              </div>
            </div>
          )}
          <LanEntry
            status={status}
            dim={dim}
            onChanged={onChanged}
            showToast={showToast}
            copy={copy}
          />
        </div>
      )}
    </>
  );
}

function LanEntry({
  status,
  dim,
  onChanged,
  showToast,
  copy,
}: {
  status: Status;
  dim: boolean;
  onChanged: () => void;
  showToast: (t: Toast) => void;
  copy: (url: string, done: string) => Promise<void>;
}): ReactElement {
  const [portText, setPortText] = useState(String(status.lan.port));
  const [portAlert, setPortAlert] = useState<{ kind: 'bad' | 'ok'; text: string } | undefined>();
  const [nicAlert, setNicAlert] = useState<string | undefined>();
  const alertTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useMounted();
  const [, savePort, portSaving] = useSave(onChanged);
  const [, saveNic, nicSaving] = useSave(onChanged);

  useEffect(() => setPortText(String(status.lan.port)), [status.lan.port]);
  useEffect(() => () => clearTimeout(alertTimer.current), []);

  const address = preferredAddress(status);
  const lanUrl = address ? `http://${address}:${status.lan.port}` : undefined;

  const flashPort = (alert: { kind: 'bad' | 'ok'; text: string }, ms: number): void => {
    clearTimeout(alertTimer.current);
    setPortAlert(alert);
    alertTimer.current = setTimeout(() => {
      if (mounted.current) setPortAlert(undefined);
    }, ms);
  };

  /** 端口：回车或离开输入框时生效；不合法原地报错，不发请求。 */
  const commitPort = async (): Promise<void> => {
    const text = portText.trim();
    if (text === String(status.lan.port) || portSaving()) return;
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
    if (result === undefined || !mounted.current) return;
    if (result.ok) {
      flashPort({ kind: 'ok', text: t.conn.portSaved }, PORT_SAVED_MS);
      return;
    }
    if (result.kind === 'rejected' && result.code === ERROR_CODES.portInUse)
      setPortAlert({ kind: 'bad', text: t.conn.portInUse(port) });
    else if (result.kind === 'rejected' && result.code === ERROR_CODES.invalidPort)
      setPortAlert({ kind: 'bad', text: t.conn.portIsMain(port) });
    else showToast({ kind: 'bad', text: failureText(result) });
  };

  const changeNic = async (host: string): Promise<void> => {
    if (nicSaving()) return;
    setNicAlert(undefined);
    const result = await saveNic({ lanHost: host });
    if (result === undefined || result.ok || !mounted.current) return;
    if (result.kind === 'rejected' && result.code === ERROR_CODES.portInUse)
      setNicAlert(t.conn.portInUse(status.lan.port));
    else if (result.kind === 'rejected' && result.code === ERROR_CODES.hostUnavailable)
      setNicAlert(t.conn.nicMissing);
    else showToast({ kind: 'bad', text: failureText(result) });
  };

  const ips = status.lanIps ?? [];
  const nicMissingNow = status.lan.hostMissing || status.lan.error === 'host-unavailable';

  return (
    <div className="group-wrap">
      <h2 className="group-head">{t.conn.lanGroup}</h2>
      <div className={`group${dim ? ' dim' : ''}`}>
        <div className="row">
          <div className="row-main">
            <p className="row-label">{t.conn.addrLabel}</p>
          </div>
          {lanUrl !== undefined ? (
            <div className="row-end addr">
              <span className="mono">{lanUrl}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={t.conn.copyLan}
                title={t.conn.copyLan}
                onClick={() => void copy(lanUrl, t.conn.copiedLan)}
              >
                <CopyIcon />
              </button>
            </div>
          ) : (
            <span className="row-value">{t.conn.nicNoNetwork}</span>
          )}
        </div>
        <div className="row">
          <div className="row-main">
            <p className="row-label">{t.conn.nicLabel}</p>
            <RowDesc
              text={t.conn.nicDesc}
              alert={
                nicAlert !== undefined
                  ? { kind: 'bad', text: nicAlert }
                  : nicMissingNow
                    ? { kind: 'bad', text: t.conn.nicMissing }
                    : undefined
              }
            />
          </div>
          {status.local ? (
            <select
              className="select"
              aria-label={t.conn.nicLabel}
              value={status.lan.host}
              onChange={(e) => void changeNic(e.target.value)}
            >
              <option value="">{t.conn.nicAll}</option>
              {ips.map((i) => (
                <option key={`${i.name}-${i.address}`} value={i.address}>
                  {isOverlay(i.address)
                    ? `${i.name} · ${t.conn.nicOverlay} · ${i.address}`
                    : `${i.name} · ${i.address}`}
                </option>
              ))}
              {status.lan.host !== '' && !ips.some((i) => i.address === status.lan.host) && (
                <option value={status.lan.host}>{status.lan.host}</option>
              )}
            </select>
          ) : (
            <span className="row-value">{status.lan.host || t.conn.nicAll}</span>
          )}
        </div>
        <div className="row">
          <div className="row-main">
            <p className="row-label">{t.conn.portLabel}</p>
            <RowDesc
              text={t.conn.portDesc}
              alert={
                portAlert ??
                (status.lan.error === 'port-in-use'
                  ? { kind: 'bad', text: t.conn.portInUse(status.lan.port) }
                  : undefined)
              }
            />
          </div>
          {status.local ? (
            <input
              className="field num"
              inputMode="numeric"
              aria-label={t.conn.portLabel}
              aria-invalid={portAlert?.kind === 'bad' || undefined}
              value={portText}
              onChange={(e) => {
                setPortText(e.target.value);
                if (portAlert?.kind === 'bad') setPortAlert(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitPort();
                // 正在改端口时按 Esc 只撤销这次输入，不关设置窗口；没在改时交给 dsh 关窗口。
                if (e.key === 'Escape' && (portText !== String(status.lan.port) || portAlert)) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  setPortText(String(status.lan.port));
                  setPortAlert(undefined);
                }
              }}
              onBlur={() => void commitPort()}
            />
          ) : (
            <span className="row-value mono">{status.lan.port}</span>
          )}
        </div>
      </div>
      <p className="group-foot warn">
        <WarnIcon />
        <span>{t.conn.insecure}</span>
      </p>
    </div>
  );
}

export function apply(ctx: Context): void {
  interface SectionSlotRegistrar {
    inject(name: string, supplier: () => unknown): void;
    register(
      spec: { name: string; id: string; order: number; label: () => string },
      component: unknown,
    ): unknown;
  }
  const slots = (ctx as unknown as { slots?: SectionSlotRegistrar }).slots;
  slots?.inject('settings.section', () =>
    slots.register(
      {
        name: 'settings.section',
        id: SECTION_ID,
        order: 100,
        label: () => t.sectionLabel,
      },
      RemoteAccessSection,
    ),
  );
}
