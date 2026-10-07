/**
 * 「安全」分段：管理密码（原地输入，有最少位数）、登录保持天数、清除密码（唯一弹确认的操作）、
 * 访问记录（最近 3 条，可展开全部并筛选）。
 */

import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ERROR_CODES,
  MIN_PASSWORD_LENGTH,
  SESSION_MAX_AGE_CHOICES,
  type RemoteAccessStatus,
} from '../shared.ts';
import type { AccessLogEntry } from '../settings.ts';
import { zh as t } from './strings.ts';
import {
  BangSmallIcon,
  CheckSmallIcon,
  DashSmallIcon,
  EyeIcon,
  RowDesc,
  Sheet,
  Spinner,
  XSmallIcon,
  ago,
  failureText,
  getJson,
  postJson,
  useMounted,
  useSelectSetting,
  type Toast,
} from './ui.tsx';

const RECENT = 3;
/** 访问记录多久刷新一次。 */
const LOG_POLL_MS = 5000;

type LogEntry = AccessLogEntry & { name: string };
type Filter = 'all' | 'deny' | 'login';
const FILTERS: readonly Filter[] = ['all', 'deny', 'login'];

const DENY_KINDS = new Set(['whitelist-deny', 'unauthorized', 'cross-site']);
const LOGIN_KINDS = new Set(['login', 'login-failed', 'logout', 'kick']);

function kindLabel(e: LogEntry): string {
  return t.sec.kind[e.kind] ?? e.kind;
}

function KindIcon({ e }: { e: LogEntry }): ReactElement {
  if (DENY_KINDS.has(e.kind) || e.kind === 'selfcheck-fail')
    return (
      <span className="chk bad" aria-hidden="true">
        <XSmallIcon />
      </span>
    );
  if (e.kind === 'login-failed')
    return (
      <span className="chk warn" aria-hidden="true">
        <BangSmallIcon />
      </span>
    );
  if (e.kind === 'login' || e.kind === 'update')
    return (
      <span className="chk ok" aria-hidden="true">
        <CheckSmallIcon />
      </span>
    );
  return (
    <span className="chk idle" aria-hidden="true">
      <DashSmallIcon />
    </span>
  );
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 记录时间：今天写「10:42」，昨天写「昨天 10:42」，更早写「9 月 30 日 10:42」；full 时今天也写「今天」。 */
function when(ts: number, full: boolean, now = new Date()): string {
  const d = new Date(ts);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return full ? `${t.sec.today} ${hm}` : hm;
  if (diff === 1) return `${t.sec.yesterday} ${hm}`;
  return `${t.dev.date(d)} ${hm}`;
}

function LogRow({ e, full }: { e: LogEntry; full: boolean }): ReactElement {
  return (
    <div className="row">
      <KindIcon e={e} />
      <div className="row-main">
        <p className="row-label">{kindLabel(e)}</p>
        <p className="row-desc inline">
          <span className="mono">{e.ip}</span>
          {e.name && <span>· {e.name}</span>}
          {(e.count ?? 1) > 1 && <span>· {t.sec.times(e.count ?? 1)}</span>}
        </p>
      </div>
      <span className="row-value mono">{when(e.ts, full)}</span>
    </div>
  );
}

export function SecurityPanel({
  status,
  onChanged,
  showToast,
  active,
}: {
  status: RemoteAccessStatus;
  onChanged: () => void;
  showToast: (t: Toast) => void;
  /** 「安全」这一页此刻是否打开着：只在打开时定时刷新访问记录。 */
  active: boolean;
}): ReactElement {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsFailed, setLogsFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const mounted = useMounted();
  const seq = useRef(0);

  const loadLogs = useCallback(async () => {
    const n = ++seq.current;
    const data = await getJson<{ logs: LogEntry[] }>('logs');
    if (!mounted.current || n !== seq.current) return;
    // 读失败不能显示成「还没有记录」：原来有的留着，从没读到过就说读不到。
    setLogsFailed(data === undefined);
    if (data === undefined) return;
    setLogs([...data.logs].sort((a, b) => b.ts - a.ts));
  }, [mounted]);

  useEffect(() => {
    if (!active) return;
    void loadLogs();
    const timer = setInterval(() => void loadLogs(), LOG_POLL_MS);
    return () => clearInterval(timer);
  }, [loadLogs, active]);

  const refresh = useCallback(() => {
    onChanged();
    void loadLogs();
  }, [onChanged, loadLogs]);

  const [keepDays, setKeepDays] = useSelectSetting(
    status.sessionMaxAgeDays,
    'sessionMaxAgeDays',
    refresh,
    showToast,
  );

  return (
    <>
      <div className="group-wrap">
        <h2 className="group-head">{t.sec.groupPassword}</h2>
        <div className="group">
          <PasswordRows status={status} onChanged={refresh} showToast={showToast} />
          <div className="row">
            <div className="row-main">
              <p className="row-label">{t.sec.keepLabel}</p>
              <RowDesc text={t.sec.keepDesc} />
            </div>
            <select
              className="select"
              aria-label={t.sec.keepLabel}
              value={keepDays}
              onChange={(e) => setKeepDays(Number(e.target.value))}
            >
              {SESSION_MAX_AGE_CHOICES.map((d) => (
                <option key={d} value={d}>
                  {t.sec.days(d)}
                </option>
              ))}
            </select>
          </div>
          {status.registered && (
            <button type="button" className="row danger" onClick={() => setClearing(true)}>
              <span className="row-main">
                <span className="row-label">{t.sec.clear}</span>
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="group-wrap">
        <h2 className="group-head">
          <span>{t.sec.groupLog}</span>
          {logs.length > 0 && (
            <button type="button" className="btn plain sm" onClick={() => setShowAll(true)}>
              {t.sec.logAll(logs.length)}
            </button>
          )}
        </h2>
        <div className="group">
          {logs.length === 0 ? (
            <div className="empty">
              <p>{logsFailed ? t.sec.logLoadFailed : t.sec.logEmpty}</p>
            </div>
          ) : (
            logs.slice(0, RECENT).map((e, i) => <LogRow key={`${e.ts}-${i}`} e={e} full={false} />)
          )}
        </div>
        <p className="group-foot">{t.sec.logFoot}</p>
      </div>

      {showAll && <LogSheet logs={logs} onClose={() => setShowAll(false)} />}
      {clearing && (
        <ClearSheet
          reopenLocal={!status.allowLoopback}
          onClose={() => setClearing(false)}
          onCleared={() => {
            setClearing(false);
            showToast({ kind: 'ok', text: t.sec.cleared });
            refresh();
          }}
          showToast={showToast}
        />
      )}
    </>
  );
}

function PasswordRows({
  status,
  onChanged,
  showToast,
}: {
  status: RemoteAccessStatus;
  onChanged: () => void;
  showToast: (t: Toast) => void;
}): ReactElement {
  const first = !status.registered;
  const [editing, setEditing] = useState(first);
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useMounted();

  // 密码有没有设变了（在别处设了 / 清了）：没设就展开输入，设了就收起、换成「更改」。
  useEffect(() => {
    setEditing(first);
    setValue('');
  }, [first]);
  useEffect(() => {
    if (editing && !first) inputRef.current?.focus();
  }, [editing, first]);

  const left = MIN_PASSWORD_LENGTH - value.length;
  const hintText =
    value.length === 0
      ? first
        ? t.sec.hintFirst
        : t.sec.hint
      : left > 0
        ? t.sec.short(left)
        : t.sec.enough;

  const submit = async (): Promise<void> => {
    if (left > 0 || busy) return;
    setBusy(true);
    const result = await postJson('password', { password: value });
    if (!mounted.current) return;
    setBusy(false);
    if (result.ok) {
      setValue('');
      setVisible(false);
      setEditing(false);
      showToast({ kind: 'ok', text: first ? t.sec.setDone : t.sec.changed });
      onChanged();
      return;
    }
    if (result.kind === 'rejected' && result.code === ERROR_CODES.tooShort) return;
    showToast({ kind: 'bad', text: failureText(result) });
  };

  const stateLine = status.registered
    ? status.passwordSetAt !== null
      ? t.sec.passwordSet(ago(status.passwordSetAt))
      : t.sec.passwordSetNoTime
    : t.sec.passwordUnset;

  return (
    <>
      <div className="row">
        <div className="row-main">
          <p className="row-label">{t.sec.passwordLabel}</p>
          <p className="row-desc inline">
            <span className={`dot${status.registered ? ' ok' : ''}`} />
            <span>{stateLine}</span>
          </p>
        </div>
        {!first && !editing && (
          <button
            type="button"
            className="btn sm"
            aria-expanded={false}
            onClick={() => setEditing(true)}
          >
            {t.sec.change}
          </button>
        )}
      </div>
      {editing && (
        <div className="row-expand" id="dla-pw-edit">
          <div className="line">
            <div className="reveal">
              <input
                ref={inputRef}
                className="field"
                type={visible ? 'text' : 'password'}
                placeholder={t.sec.newPassword}
                autoComplete="new-password"
                aria-label={t.sec.newPassword}
                aria-describedby="dla-pw-msg"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
              />
              <button
                type="button"
                className="icon-btn eye"
                aria-label={t.sec.showPassword}
                aria-pressed={visible}
                onClick={() => setVisible((v) => !v)}
              >
                <EyeIcon />
              </button>
            </div>
            {!first && (
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setEditing(false);
                  setValue('');
                }}
              >
                {t.sec.cancel}
              </button>
            )}
            <button
              type="button"
              className="btn primary sm"
              disabled={left > 0}
              aria-busy={busy || undefined}
              onClick={() => void submit()}
            >
              {busy && <Spinner />}
              {first ? t.sec.setFirst : t.sec.save}
            </button>
          </div>
          <p
            className={`msg${value.length > 0 && left <= 0 ? ' ok' : ''}`}
            id="dla-pw-msg"
            aria-live="polite"
          >
            {value.length > 0 && left <= 0 && (
              <span aria-hidden="true">
                <CheckSmallIcon />{' '}
              </span>
            )}
            {hintText}
          </p>
        </div>
      )}
    </>
  );
}

function ClearSheet({
  reopenLocal,
  onClose,
  onCleared,
  showToast,
}: {
  reopenLocal: boolean;
  onClose: () => void;
  onCleared: () => void;
  showToast: (t: Toast) => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title={t.sec.clearTitle}
      lead={reopenLocal ? `${t.sec.clearBody}${t.sec.clearReopenLocal}` : t.sec.clearBody}
      role="alertdialog"
      onClose={onClose}
    >
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose} data-autofocus="">
          {t.sec.cancel}
        </button>
        <button
          type="button"
          className="btn danger-solid"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void postJson('password/clear', {}).then((r) => {
              setBusy(false);
              if (r.ok) onCleared();
              else showToast({ kind: 'bad', text: failureText(r) });
            });
          }}
        >
          {t.sec.clearConfirm}
        </button>
      </div>
    </Sheet>
  );
}

function LogSheet({ logs, onClose }: { logs: LogEntry[]; onClose: () => void }): ReactElement {
  const [filter, setFilter] = useState<Filter>('all');
  const shown = logs.filter(
    (e) =>
      filter === 'all' || (filter === 'deny' ? DENY_KINDS.has(e.kind) : LOGIN_KINDS.has(e.kind)),
  );
  return (
    <Sheet title={t.sec.logTitle} onClose={onClose} wide>
      <div className="seg" role="tablist" aria-label={t.sec.filterAria}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            id={`dla-log-filter-${f}`}
            aria-selected={filter === f}
            tabIndex={filter === f ? 0 : -1}
            onClick={() => setFilter(f)}
            onKeyDown={(e) => {
              // 方向键 / Home / End 在三个筛选间移动（只有选中的那个在 Tab 顺序里）。
              const i = FILTERS.indexOf(filter);
              const next =
                e.key === 'ArrowRight'
                  ? FILTERS[(i + 1) % FILTERS.length]
                  : e.key === 'ArrowLeft'
                    ? FILTERS[(i - 1 + FILTERS.length) % FILTERS.length]
                    : e.key === 'Home'
                      ? FILTERS[0]
                      : e.key === 'End'
                        ? FILTERS[FILTERS.length - 1]
                        : undefined;
              if (next === undefined) return;
              e.preventDefault();
              setFilter(next);
              document.getElementById(`dla-log-filter-${next}`)?.focus();
            }}
          >
            {t.sec.filter[f]}
          </button>
        ))}
      </div>
      <div className="group log-list">
        {shown.length === 0 ? (
          <div className="empty">
            <p>{t.sec.logEmpty}</p>
          </div>
        ) : (
          shown.map((e, i) => <LogRow key={`${e.ts}-${i}`} e={e} full />)
        )}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn primary" onClick={onClose}>
          {t.sec.done}
        </button>
      </div>
    </Sheet>
  );
}
