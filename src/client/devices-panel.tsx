/**
 * 「设备」分段：允许的设备表（每行带登录状态），点开可改名、退出登录、移出列表；
 * 「添加设备」里列出最近被拒的地址。移出、退出都不弹确认，做完给「撤销」。
 */

import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeviceEntry, DeviceSession, DevicesView } from '../devices.ts';
import type { WhitelistEntry } from '../settings.ts';
import { whitelistValueKind } from '../shared.ts';
import { zh as t } from './strings.ts';
import {
  ChevronIcon,
  PlusIcon,
  RowDesc,
  Sheet,
  Switch,
  ago,
  failureText,
  getJson,
  postJson,
  useMounted,
  useSave,
  useSelectSetting,
  type Toast,
} from './ui.tsx';

/** 设置页开着时多久刷新一次设备表（登录状态、多久前活跃）。 */
const DEVICES_POLL_MS = 5000;

type ValueCheck = { kind: 'empty' | 'single' | 'range' | 'invalid' | 'duplicate' };

/** 和后端 isValidWhitelistValue 同一套规则：IPv4、IPv4/前缀、IPv6 单个地址。 */
export function checkValue(raw: string, taken: string[]): ValueCheck {
  const v = raw.trim();
  if (v === '') return { kind: 'empty' };
  // 和后端保存时用的是同一份校验（shared.ts），这里说能加的，保存时不会被拒。
  const kind = whitelistValueKind(v);
  if (kind !== 'invalid' && taken.includes(v)) return { kind: 'duplicate' };
  return { kind };
}

function valueMessage(check: ValueCheck): { text: string; bad: boolean } {
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

const label = (e: WhitelistEntry): string => e.name || e.value;

/** 一行的状态句：已登录 · 浏览器 · 多久前活跃 / N 个浏览器已登录 / 免密码 / 未登录。 */
function statusLine(entry: DeviceEntry, bypass: boolean): { dot: 'ok' | 'idle'; text: string } {
  const n = entry.sessions.length;
  if (n === 1) {
    const s = entry.sessions[0]!;
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
      text:
        entry.lastSeenAt !== null
          ? `${t.dev.bypass} · ${t.dev.active(ago(entry.lastSeenAt))}`
          : `${t.dev.bypass} · ${t.dev.neverSeen}`,
    };
  return { dot: 'idle', text: t.dev.notLoggedIn };
}

export function DevicesPanel({
  local,
  showToast,
  onChanged,
  active,
}: {
  local: boolean;
  showToast: (t: Toast) => void;
  onChanged: () => void;
  /** 「设备」这一页此刻是否打开着：只在打开时定时刷新。 */
  active: boolean;
}): ReactElement {
  const [view, setView] = useState<DevicesView | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);
  /** 最新一次读到的列表（撤销移出时用它，不用移出那一刻的旧列表）。 */
  const viewRef = useRef<DevicesView | undefined>(undefined);
  /** 退出登录正在发：连点不重复发。 */
  const kicking = useRef(false);
  const [openId, setOpenId] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const mounted = useMounted();
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!local) return;
    const n = ++seq.current;
    const v = await getJson<DevicesView>('devices');
    if (!mounted.current || n !== seq.current) return;
    if (v === undefined) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    viewRef.current = v;
    setView(v);
  }, [local, mounted]);

  useEffect(() => {
    if (!active) return;
    void load();
    const timer = setInterval(() => void load(), DEVICES_POLL_MS);
    return () => clearInterval(timer);
  }, [load, active]);

  const refresh = useCallback(() => {
    void load();
    onChanged();
  }, [load, onChanged]);

  /** 打开「添加设备」时重读一次：刚被拒的设备马上出现在「最近被拒绝的地址」里，不等下一轮刷新。 */
  const openAdd = (): void => {
    setAdding(true);
    void load();
  };

  const [, saveList] = useSave(refresh);

  /** 写回整张允许列表；失败给提示。 */
  const writeList = async (list: WhitelistEntry[]): Promise<boolean> => {
    const result = await saveList({ whitelist: list });
    if (result === undefined) return false;
    if (!result.ok) showToast({ kind: 'bad', text: failureText(result) });
    return result.ok;
  };

  const signOut = async (session: DeviceSession, who: string): Promise<void> => {
    if (kicking.current) return;
    kicking.current = true;
    const result = await postJson('kick', { sid: session.sid });
    kicking.current = false;
    if (!mounted.current) return;
    if (result.ok) {
      showToast({ kind: 'ok', text: t.dev.signedOut(t.dev.whoBrowser(who, session.browser)) });
      refresh();
    } else showToast({ kind: 'bad', text: failureText(result) });
  };

  const signOutAll = async (): Promise<void> => {
    if (kicking.current) return;
    kicking.current = true;
    const result = await postJson('kick-all', {});
    kicking.current = false;
    if (!mounted.current) return;
    if (result.ok) {
      showToast({ kind: 'ok', text: t.dev.signedOutAll });
      refresh();
    } else showToast({ kind: 'bad', text: failureText(result) });
  };

  const [emptyMode, setEmptyMode] = useSelectSetting(
    view?.emptyMode ?? 'deny-all',
    'whitelistEmptyMode',
    refresh,
    showToast,
  );

  if (!local) return <></>;
  if (view === undefined)
    return loadFailed ? (
      <div className="group-wrap">
        <div className="group">
          <div className="empty">
            <p>{t.dev.loadFailed}</p>
            <button type="button" className="btn sm" onClick={() => void load()}>
              {t.dev.retry}
            </button>
          </div>
        </div>
      </div>
    ) : (
      <></>
    );

  const entries = view.entries;
  const list: WhitelistEntry[] = entries.map(({ id, name, value }) => ({ id, name, value }));
  const anyLoggedIn = entries.some((e) => e.sessions.length > 0) || view.others.length > 0;
  const open = entries.find((e) => e.id === openId);

  const remove = async (entry: DeviceEntry): Promise<void> => {
    setOpenId(undefined);
    const index = list.findIndex((e) => e.id === entry.id);
    const next = list.filter((e) => e.id !== entry.id);
    if (!(await writeList(next))) return;
    // 打开面板的那一行没了：焦点放到「添加设备」上，键盘用户不会掉到页面最外层。
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>('.dla #dla-panel-dev .row.add, .dla #dla-panel-dev .empty .btn')
        ?.focus(),
    );
    showToast({
      kind: 'plain',
      text: t.dev.removed(label(entry)),
      undo: () => {
        // 撤销：放回当前列表的原位置（已失效的登录回不来，要重新输密码）。
        const current = (viewRef.current?.entries ?? []).map(({ id, name, value }) => ({
          id,
          name,
          value,
        }));
        if (current.some((e) => e.value === entry.value)) return;
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

  return (
    <>
      <div className="group-wrap">
        <h2 className="group-head">
          <span>
            {t.dev.groupTitle} <span className="count">{entries.length}</span>
          </span>
          {entries.length > 0 && (
            <button
              type="button"
              className="btn plain sm"
              disabled={!anyLoggedIn}
              onClick={() => void signOutAll()}
            >
              {t.dev.signOutAll}
            </button>
          )}
        </h2>
        <div className="group">
          {entries.length === 0 ? (
            <div className="empty">
              <p>{t.dev.emptyText}</p>
              <button type="button" className="btn primary sm" onClick={openAdd}>
                <PlusIcon size={12} />
                {t.dev.addShort}
              </button>
            </div>
          ) : (
            <>
              {entries.map((entry) => {
                const line = statusLine(entry, view.bypassPassword);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="row"
                    onClick={() => setOpenId(entry.id)}
                  >
                    <div className="row-main">
                      <p className="row-label">{label(entry)}</p>
                      <p className="row-desc inline">
                        <span className="mono">{entry.value}</span>
                        <span>·</span>
                        <span className={`dot${line.dot === 'ok' ? ' ok' : ''}`} />
                        <span>{line.text}</span>
                      </p>
                    </div>
                    <ChevronIcon />
                  </button>
                );
              })}
              <button type="button" className="row add" onClick={openAdd}>
                <span className="plus">
                  <PlusIcon />
                </span>
                <div className="row-main">
                  <p className="row-label">{t.dev.add}</p>
                </div>
              </button>
            </>
          )}
        </div>
        <p className="group-foot">
          {entries.length === 0 ? t.dev.emptyFoot(t.dev.emptyMode[view.emptyMode]) : t.dev.foot}
        </p>
      </div>

      {view.others.length > 0 && (
        <div className="group-wrap">
          <h2 className="group-head">{t.dev.othersTitle}</h2>
          <div className="group">
            {view.others.map((s) => (
              <div key={s.sid} className="row">
                <div className="row-main">
                  <p className="row-label">
                    {s.browser} · {s.os}
                  </p>
                  <p className="row-desc inline">
                    <span className="mono">{s.ip}</span>
                    <span>·</span>
                    <span className="dot ok" />
                    <span>{t.dev.active(ago(s.lastSeenAt))}</span>
                  </p>
                </div>
                <button type="button" className="btn sm" onClick={() => void signOut(s, s.ip)}>
                  {t.dev.signOut}
                </button>
              </div>
            ))}
          </div>
          <p className="group-foot">{t.dev.othersDesc}</p>
        </div>
      )}

      <div className="group-wrap">
        <div className="group">
          <div className="row">
            <div className="row-main">
              <p className="row-label">{t.dev.emptyModeLabel}</p>
            </div>
            <select
              className="select"
              aria-label={t.dev.emptyModeLabel}
              value={emptyMode}
              onChange={(e) => setEmptyMode(e.target.value as typeof emptyMode)}
            >
              <option value="deny-all">{t.dev.emptyMode['deny-all']}</option>
              <option value="private-only">{t.dev.emptyMode['private-only']}</option>
            </select>
          </div>
          <BypassRow value={view.bypassPassword} onChanged={refresh} showToast={showToast} />
        </div>
      </div>

      {open !== undefined && (
        <DeviceSheet
          entry={open}
          bypass={view.bypassPassword}
          taken={list.filter((e) => e.id !== open.id).map((e) => e.value)}
          onClose={() => setOpenId(undefined)}
          onSave={async (name, value) => {
            const ok = await writeList(
              list.map((e) =>
                e.id === open.id ? { ...e, name: name.trim(), value: value.trim() } : e,
              ),
            );
            if (ok) setOpenId(undefined);
          }}
          onRemove={() => void remove(open)}
          onSignOut={(s) => void signOut(s, label(open))}
        />
      )}

      {adding && (
        <AddSheet
          bypass={view.bypassPassword}
          taken={list.map((e) => e.value)}
          recent={view.recentDenied}
          onClose={() => setAdding(false)}
          onAdd={async (name, value) => {
            const entry = {
              id: `wl-${Date.now().toString(36)}`,
              name: name.trim(),
              value: value.trim(),
            };
            if (await writeList([...list, entry])) {
              setAdding(false);
              showToast({ kind: 'ok', text: t.dev.added(label(entry)) });
            }
          }}
        />
      )}
    </>
  );
}

function BypassRow({
  value,
  onChanged,
  showToast,
}: {
  value: boolean;
  onChanged: () => void;
  showToast: (t: Toast) => void;
}): ReactElement {
  const [optimistic, setOptimistic] = useState<boolean | undefined>();
  const [busy, save, isSaving] = useSave(onChanged);
  useEffect(() => setOptimistic(undefined), [value]);
  return (
    <div className="row">
      <div className="row-main">
        <p className="row-label">{t.dev.bypassLabel}</p>
        <RowDesc text={t.dev.bypassDesc} />
      </div>
      <Switch
        checked={optimistic ?? value}
        label={t.dev.bypassLabel}
        busy={busy}
        onToggle={(next) => {
          if (isSaving()) return;
          setOptimistic(next);
          void save({ whitelistBypassPassword: next }).then((r) => {
            if (r === undefined || r.ok) return;
            setOptimistic(undefined);
            showToast({ kind: 'bad', text: failureText(r) });
          });
        }}
      />
    </div>
  );
}

function DeviceSheet({
  entry,
  bypass,
  taken,
  onClose,
  onSave,
  onRemove,
  onSignOut,
}: {
  entry: DeviceEntry;
  bypass: boolean;
  taken: string[];
  onClose: () => void;
  onSave: (name: string, value: string) => Promise<void>;
  onRemove: () => void;
  onSignOut: (s: DeviceSession) => void;
}): ReactElement {
  const [name, setName] = useState(entry.name);
  const [value, setValue] = useState(entry.value);
  const check = checkValue(value, taken);
  const valid = check.kind === 'single' || check.kind === 'range';
  const changed = name.trim() !== entry.name || value.trim() !== entry.value;
  const msg = valueMessage(check);

  return (
    <Sheet title={label(entry)} lead={t.dev.detailLead} onClose={onClose}>
      <label className="f">
        {t.dev.nameLabel}
        <input
          className="field"
          value={name}
          placeholder={t.dev.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          data-autofocus=""
        />
      </label>
      <label className="f">
        {t.dev.valueLabel}
        <input
          className="field mono"
          value={value}
          aria-invalid={msg.bad || undefined}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {(msg.bad || value.trim() !== entry.value) && (
        <p className={`msg${msg.bad ? ' bad' : ''}`} role="status">
          {msg.text}
        </p>
      )}
      <div className="group-wrap">
        <span className="sub">{t.dev.loginState}</span>
        {entry.sessions.length > 0 ? (
          <div className="group">
            {entry.sessions.map((s) => (
              <div key={s.sid} className="row">
                <div className="row-main">
                  <p className="row-label">
                    {s.browser} · {s.os}
                  </p>
                  <p className="row-desc inline">
                    <span className="dot ok" />
                    <span>
                      {t.dev.loggedIn} · {t.dev.active(ago(s.lastSeenAt))} ·{' '}
                      {t.dev.loginSince(t.dev.date(new Date(s.createdAt)))}
                    </span>
                  </p>
                </div>
                <button type="button" className="btn sm" onClick={() => onSignOut(s)}>
                  {t.dev.signOut}
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <p className="msg">
          {entry.sessions.length > 0
            ? t.dev.signOutNote
            : bypass
              ? t.dev.bypassNote
              : t.dev.noSessions}
        </p>
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn danger left" onClick={onRemove}>
          {t.dev.remove}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          {t.dev.cancel}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={changed && !valid}
          onClick={() => (changed ? void onSave(name, value) : onClose())}
        >
          {t.dev.done}
        </button>
      </div>
    </Sheet>
  );
}

function AddSheet({
  bypass,
  taken,
  recent,
  onClose,
  onAdd,
}: {
  bypass: boolean;
  taken: string[];
  recent: DevicesView['recentDenied'];
  onClose: () => void;
  onAdd: (name: string, value: string) => Promise<void>;
}): ReactElement {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const check = checkValue(value, taken);
  const valid = check.kind === 'single' || check.kind === 'range';
  const msg = valueMessage(check);
  const usable = recent.filter((d) => !taken.includes(d.ip));

  return (
    <Sheet
      title={t.dev.addTitle}
      lead={bypass ? t.dev.addLeadBypass : t.dev.addLead}
      onClose={onClose}
    >
      <label className="f">
        {t.dev.nameLabel}
        <input
          className="field"
          value={name}
          placeholder={t.dev.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          data-autofocus=""
        />
      </label>
      <label className="f">
        {t.dev.valueLabel}
        <input
          className="field mono"
          value={value}
          placeholder={t.dev.valuePlaceholder}
          aria-invalid={msg.bad || undefined}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid && !busy) {
              setBusy(true);
              void onAdd(name, value).finally(() => setBusy(false));
            }
          }}
        />
      </label>
      <p className={`msg${msg.bad ? ' bad' : ''}`} role="status">
        {msg.text}
      </p>
      {usable.length > 0 && (
        <div className="group-wrap">
          <span className="sub">{t.dev.recentTitle}</span>
          <div className="chips">
            {usable.map((d) => (
              <button
                key={d.ip}
                type="button"
                className="chip"
                aria-pressed={value.trim() === d.ip}
                onClick={() => setValue(d.ip)}
              >
                <span className="mono">{d.ip}</span>
                <span className="t3">{t.dev.recentMeta(d.count, ago(d.lastAt))}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t.dev.cancel}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!valid || busy}
          onClick={() => {
            setBusy(true);
            void onAdd(name, value).finally(() => setBusy(false));
          }}
        >
          {t.dev.addConfirm}
        </button>
      </div>
    </Sheet>
  );
}
