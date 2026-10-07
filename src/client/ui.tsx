/**
 * 设置页的公用零件：和后端说话、开关、行说明、提示条类型、图标、保存过程。
 * 各分段（连接、设备、安全、关于）都从这里取，不各写一套。
 */

import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ERROR_CODES, type RemoteAccessStatus } from '../shared.ts';
import { zh as t } from './strings.ts';

type Status = RemoteAccessStatus;

/** 底部提示条。带 undo 时右边出「撤销」按钮（能撤销的操作不弹确认，做完给撤销）。 */
export type Toast = { kind: 'ok' | 'bad' | 'plain'; text: string; undo?: () => void };
export type SaveFailure = { kind: 'network' } | { kind: 'rejected'; code?: string; port?: number };
export type SaveResult = { ok: true; data?: unknown } | ({ ok: false } & SaveFailure);

/** 保存不到这么久就不显示「进行中」。 */
export const BUSY_DELAY_MS = 1000;
/** 「关不掉」红字提示停留时长。 */
export const INLINE_ERROR_MS = 3000;
/** 底部提示条停留时长。 */
export const TOAST_MS = 3000;

export function getStatus(): Promise<Status | undefined> {
  return getJson<Status>('status');
}

export const API = '/api/remote-access';

/** 读一个本机接口的 JSON；失败返回 undefined。 */
export async function getJson<T>(path: string): Promise<T | undefined> {
  try {
    const res = await fetch(`${API}/${path}`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

/** 往本机接口 POST 一段 JSON，按「没送到 / 被拒（带错误码）/ 成功」返回。 */
export async function postJson(path: string, body: unknown): Promise<SaveResult> {
  let res: Response;
  try {
    res = await fetch(`${API}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, kind: 'network' };
  }
  if (res.ok) return { ok: true, data: await res.json().catch(() => undefined) };
  const data = (await res.json().catch(() => ({}))) as { code?: string; port?: number };
  return { ok: false, kind: 'rejected', code: data.code, port: data.port };
}

/** 保存失败时给用户看的那句话：按原因分，不一律说「没有响应」。 */
export function failureText(failure: SaveFailure): string {
  if (failure.kind === 'network') return t.errors.noResponse;
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

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
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
export function useMounted(): { readonly current: boolean } {
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
export const WifiIcon = (): ReactElement => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5a10 10 0 0 1 14 0" />
    <path d="M8.5 16a5 5 0 0 1 7 0" />
    <path d="M1.5 9a15 15 0 0 1 21 0" />
    <circle cx="12" cy="19.5" r="1" />
  </svg>
);
export const CopyIcon = (): ReactElement => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);
export const InfoIcon = (): ReactElement => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);
export const WarnIcon = (): ReactElement => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3 2 20h20L12 3z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
);
export const CheckIcon = (): ReactElement => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m5 12 5 5 9-10" />
  </svg>
);
export const BangIcon = (): ReactElement => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 7v6M12 17h.01" />
  </svg>
);

/**
 * 一个开关的保存：同一时刻只允许一次（连点时后面的点击直接忽略），超过 1 秒才显示
 * 「进行中」，组件卸载后不再更新状态。
 */
export function useSave(
  onSaved: () => void,
  path = 'settings',
): [
  busy: boolean,
  save: (patch: Record<string, unknown>) => Promise<SaveResult | undefined>,
  isSaving: () => boolean,
] {
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const mounted = useMounted();
  const save = useCallback(
    async (patch: Record<string, unknown>): Promise<SaveResult | undefined> => {
      if (saving.current) return undefined;
      saving.current = true;
      const timer = setTimeout(() => {
        if (mounted.current) setBusy(true);
      }, BUSY_DELAY_MS);
      const result = await postJson(path, patch);
      clearTimeout(timer);
      saving.current = false;
      if (!mounted.current) return undefined;
      setBusy(false);
      if (result.ok) onSaved();
      return result;
    },
    [onSaved, mounted, path],
  );
  const isSaving = useCallback(() => saving.current, []);
  return [busy, save, isSaving];
}

/** 下拉选择的保存：以最后一次选的为准，上一次还在保存时排队；失败弹回并提示。 */
export function useSelectSetting<T extends string | number>(
  serverValue: T,
  key: string,
  onSaved: () => void,
  showToast: (toast: Toast) => void,
): [value: T, change: (next: T) => void] {
  const [shown, setShown] = useState<T | undefined>();
  const [, save, isSaving] = useSave(onSaved);
  const queued = useRef<T | undefined>(undefined);
  useEffect(() => {
    if (shown !== undefined && shown === serverValue && !isSaving() && queued.current === undefined)
      setShown(undefined);
  }, [serverValue, shown, isSaving]);
  const send = async (value: T): Promise<void> => {
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
  const change = (next: T): void => {
    setShown(next);
    if (isSaving()) queued.current = next;
    else void send(next);
  };
  return [shown ?? serverValue, change];
}

/** 开关。保存中用 aria-disabled 而不是原生 disabled，键盘焦点不会丢。 */
export function Switch({
  checked,
  label,
  busy,
  onToggle,
}: {
  checked: boolean;
  label: string;
  busy: boolean;
  onToggle: (next: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) onToggle(!checked);
      }}
    />
  );
}

export function useGuardedSwitch(
  value: boolean,
  key: string,
  onChanged: () => void,
  showToast: (t: Toast) => void,
  inlineFor: (failure: SaveFailure & { port?: number }) => string | undefined,
): {
  checked: boolean;
  busy: boolean;
  inlineError: string | undefined;
  toggle: (next: boolean) => void;
} {
  const [optimistic, setOptimistic] = useState<boolean | undefined>();
  const [inlineError, setInlineError] = useState<string | undefined>();
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useMounted();
  const [busy, save, isSaving] = useSave(onChanged);

  useEffect(() => setOptimistic(undefined), [value]);
  useEffect(() => () => clearTimeout(errorTimer.current), []);

  const toggle = (next: boolean): void => {
    if (isSaving()) return;
    setOptimistic(next);
    void save({ [key]: next }).then((result) => {
      if (result === undefined || result.ok || !mounted.current) return;
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
        if (mounted.current) setInlineError(undefined);
      }, INLINE_ERROR_MS);
    });
  };

  return { checked: optimistic ?? value, busy, inlineError, toggle };
}

/** 设置行的说明：常驻 aria-live 区，有提示时换成提示文字（红 / 绿），读屏软件会念出来。 */
export function RowDesc({
  text,
  alert,
}: {
  text: string;
  alert?: { kind: 'bad' | 'ok'; text: string };
}): ReactElement {
  return (
    <p className={`row-desc${alert ? ` ${alert.kind}` : ''}`} aria-live="polite">
      {alert?.text ?? text}
    </p>
  );
}

const svg = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const ChevronIcon = (): ReactElement => (
  <svg className="chev" width="8" height="13" viewBox="0 0 8 13" strokeWidth="1.8" {...svg}>
    <path d="m1.5 1.5 5 5-5 5" />
  </svg>
);
export const PlusIcon = ({ size = 16 }: { size?: number }): ReactElement => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="2" {...svg}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const EyeIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.6" {...svg}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const XSmallIcon = (): ReactElement => (
  <svg width="10" height="10" viewBox="0 0 24 24" strokeWidth="3" {...svg}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const BangSmallIcon = (): ReactElement => (
  <svg width="10" height="10" viewBox="0 0 24 24" strokeWidth="3" {...svg}>
    <path d="M12 6v8M12 18h.01" />
  </svg>
);
export const CheckSmallIcon = (): ReactElement => (
  <svg width="11" height="11" viewBox="0 0 24 24" strokeWidth="2.6" {...svg}>
    <path d="m5 12 5 5 9-10" />
  </svg>
);
export const DashSmallIcon = (): ReactElement => (
  <svg width="10" height="10" viewBox="0 0 24 24" strokeWidth="3" {...svg}>
    <path d="M7 12h10" />
  </svg>
);
export const Spinner = (): ReactElement => <span className="spin" aria-hidden="true" />;

/** 「多久前」：刚刚 / N 分钟前 / N 小时前 / N 天前。 */
export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return t.time.justNow;
  if (s < 3600) return t.time.minutes(Math.floor(s / 60));
  if (s < 86400) return t.time.hours(Math.floor(s / 3600));
  return t.time.days(Math.floor(s / 86400));
}

/** 弹出面板：Esc 或点空白关闭（不会连带关掉 dsh 设置窗口），Tab 只在面板里转，关掉后焦点回到原按钮。 */
export function Sheet({
  title,
  lead,
  role = 'dialog',
  onClose,
  children,
  wide = false,
}: {
  title: string;
  lead?: string;
  role?: 'dialog' | 'alertdialog';
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const leadId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, button');
    first?.focus();
    // Esc 先由面板接住，只关面板，不让 dsh 把设置窗口一起关掉。
    const onEsc = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeRef.current();
    };
    document.addEventListener('keydown', onEsc, true);
    // 面板里获得焦点的元素被移除时，把焦点放回面板，键盘操作不掉到页面上。
    const observer = new MutationObserver(() => {
      if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus();
    });
    if (ref.current) observer.observe(ref.current, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('keydown', onEsc, true);
      observer.disconnect();
      opener?.focus?.();
    };
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab' || ref.current === null) return;
    const items = [
      ...ref.current.querySelectorAll<HTMLElement>(
        'button:not([tabindex="-1"]), input:not([tabindex="-1"]), select:not([tabindex="-1"]), [tabindex="0"]',
      ),
    ].filter((el) => !el.hasAttribute('disabled'));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`sheet${wide ? ' wide' : ''}`}
        tabIndex={-1}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={lead ? leadId : undefined}
        onKeyDown={onKeyDown}
      >
        <div>
          <h3 id={titleId}>{title}</h3>
          {lead && (
            <p className="lead" id={leadId}>
              {lead}
            </p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
