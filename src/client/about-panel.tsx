/**
 * 「关于」分段（R-015 / R-007 / R-008），按 设计稿 定稿：
 * - 版本：插件（一键更新六种状态）、dsh（是否在支持范围）、运行环境；
 * - 运行检查：五项逐项列出，本机可「重新检查」。
 * 最新版本只在打开「关于」时查（不后台定时查）；局域网设备只看版本和检查结果，没有按钮。
 */

import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { CheckResult, UpdateState } from '../shared.ts';
import { zh as t } from './strings.ts';
import {
  BangSmallIcon,
  CheckSmallIcon,
  DashSmallIcon,
  Spinner,
  XSmallIcon,
  ago,
  failureText,
  getJson,
  postJson,
  useMounted,
  type Toast,
} from './ui.tsx';
import type { RemoteAccessStatus } from '../shared.ts';

type A = typeof t.about;

function checkDesc(c: CheckResult): string {
  const s = t.about.check;
  switch (c.id) {
    case 'webServer':
      return c.state === 'ok' ? s.webServer.ok(c.port ?? 0) : s.webServer.bad;
    case 'signing':
      return c.state === 'ok' ? s.signing.ok : s.signing.bad;
    case 'sessionKey':
      return c.state === 'ok' ? s.sessionKey.ok : s.sessionKey.bad;
    case 'dshVersion':
      if (c.version == null) return s.dshVersion.unknown;
      return c.state === 'ok' ? s.dshVersion.ok(c.version) : s.dshVersion.warn(c.version);
    case 'password':
      return c.state === 'ok' ? s.password.ok : s.password.idle;
  }
}

export function CheckIcon({ state }: { state: CheckResult['state'] }): ReactElement {
  const icon =
    state === 'ok' ? (
      <CheckSmallIcon />
    ) : state === 'bad' ? (
      <XSmallIcon />
    ) : state === 'warn' ? (
      <BangSmallIcon />
    ) : (
      <DashSmallIcon />
    );
  return (
    <span className={`chk ${state}`} role="img" aria-label={t.about.stateLabel[state]}>
      {icon}
    </span>
  );
}

/** 没通过（含版本超范围）/ 通过 / 中性各几项。 */
function tally(checks: readonly CheckResult[]): { failed: number; ok: number; idle: number } {
  const n = (f: (c: CheckResult) => boolean): number => checks.filter(f).length;
  return {
    failed: n((c) => c.state === 'bad' || c.state === 'warn'),
    ok: n((c) => c.state === 'ok'),
    idle: n((c) => c.state === 'idle'),
  };
}

function CheckRow({ c }: { c: CheckResult }): ReactElement {
  return (
    <div className="row">
      <CheckIcon state={c.state} />
      <div className="row-main">
        <p className="row-label">{t.about.check[c.id].label}</p>
        <p className={`row-desc${c.state === 'bad' ? ' bad' : ''}`}>{checkDesc(c)}</p>
      </div>
    </div>
  );
}

/** 插件这一行：说明 + 按钮随更新状态变。 */
function UpdateRow({
  update,
  onCheck,
  onUpdate,
}: {
  update: UpdateState;
  onCheck: () => void;
  onUpdate: () => void;
}): ReactElement {
  const u: A['update'] = t.about.update;
  let desc: ReactElement;
  let action: ReactElement | null = null;
  switch (update.state) {
    case 'idle':
    case 'checking':
      desc = (
        <>
          <Spinner />
          {u.checking}
        </>
      );
      break;
    case 'latest':
      desc = (
        <>
          <span className="dot ok" />
          {u.latest(update.current)}
        </>
      );
      action = (
        <button type="button" className="btn sm" onClick={onCheck}>
          {u.check}
        </button>
      );
      break;
    case 'unavailable':
      desc = <>{u.unavailable(update.current)}</>;
      action = (
        <button type="button" className="btn sm" onClick={onCheck}>
          {u.check}
        </button>
      );
      break;
    case 'available': {
      const [head, tail] = u.available(update.current, update.latest ?? '');
      desc = (
        <>
          {head}
          <span className="acc-text">{tail}</span>
        </>
      );
      action = (
        <button type="button" className="btn primary sm" onClick={onUpdate}>
          {u.to(update.latest ?? '')}
        </button>
      );
      break;
    }
    case 'running':
      desc = <>{u.running}</>;
      action = (
        <button type="button" className="btn primary sm" aria-busy="true" disabled>
          <Spinner />
          {u.busy}
        </button>
      );
      break;
    case 'done':
      desc = (
        <>
          <span className="dot ok" />
          {u.done(update.latest ?? '')}
        </>
      );
      break;
    case 'failed':
      desc = (
        <>
          {update.reason === 'no-command'
            ? u.failed['no-command'](update.command ?? '')
            : u.failed[update.reason ?? 'failed']}
        </>
      );
      action = (
        <button type="button" className="btn sm" onClick={onUpdate}>
          {u.retry}
        </button>
      );
      break;
  }
  return (
    <div className="row">
      <div className="row-main">
        <p className="row-label">{t.about.plugin}</p>
        <p
          className={`row-desc inline${update.state === 'failed' ? ' bad' : ''}`}
          aria-live="polite"
        >
          {desc}
        </p>
      </div>
      {action}
    </div>
  );
}

export function AboutPanel({
  status,
  active,
  onChanged,
  showToast,
}: {
  status: RemoteAccessStatus;
  /** 「关于」这一页此刻是否打开着（打开时查一次最新版本）。 */
  active: boolean;
  onChanged: () => void;
  showToast: (t: Toast) => void;
}): ReactElement {
  const local = status.local;
  const [update, setUpdate] = useState<UpdateState | undefined>(status.update);
  const [rechecking, setRechecking] = useState(false);
  const mounted = useMounted();
  /** 查版本和点更新各用各的序号：更新进行中切走再切回来查一次，不能把更新的结果作废。 */
  const checkSeq = useRef(0);

  // 更新在服务端跑（约 30 秒）：状态轮询带回的结果到了「完成 / 失败」，界面跟着变，不靠哪一次请求回来。
  const serverUpdate = status.update;
  useEffect(() => {
    if (serverUpdate === undefined) return;
    if (serverUpdate.state === 'done' || serverUpdate.state === 'failed')
      setUpdate((u) => (u?.state === 'running' ? serverUpdate : u));
  }, [serverUpdate]);

  const check = async (): Promise<void> => {
    const n = ++checkSeq.current;
    setUpdate({ state: 'checking', current: status.version });
    const next = await getJson<UpdateState>('update');
    if (!mounted.current || n !== checkSeq.current) return;
    setUpdate(next ?? { state: 'unavailable', current: status.version });
    onChanged();
  };

  // 每次打开「关于」查一次；更新正在跑或已完成时服务端直接回那次的结果。
  useEffect(() => {
    if (active && local) void check();
  }, [active, local]);

  const runUpdate = async (): Promise<void> => {
    // 更新期间回来的「查版本」结果作废（它可能是点更新之前发出的）。
    checkSeq.current += 1;
    setUpdate((u) => ({ ...(u ?? { current: status.version }), state: 'running' }));
    const result = await postJson('update', {});
    if (!mounted.current) return;
    if (result.ok) setUpdate(result.data as UpdateState);
    else
      setUpdate((u) => ({
        ...(u ?? { current: status.version }),
        state: 'failed',
        // 请求根本没送到才是「连不上」；被拒（不是本机等）按一般失败说，不让人去查网络。
        reason: result.kind === 'network' ? 'network' : 'failed',
      }));
    onChanged();
  };

  const recheck = async (): Promise<void> => {
    if (rechecking) return;
    setRechecking(true);
    const result = await postJson('selfcheck', {});
    if (!mounted.current) return;
    setRechecking(false);
    onChanged();
    if (!result.ok) {
      showToast({ kind: 'bad', text: failureText(result) });
      return;
    }
    const checks = (result.data as { checks: CheckResult[] }).checks;
    const { failed, ok, idle } = tally(checks);
    showToast(
      failed > 0
        ? { kind: 'bad', text: t.about.toastFailed(failed) }
        : { kind: 'ok', text: idle > 0 ? t.about.toastPassedUnset(ok) : t.about.toastPassed(ok) },
    );
  };

  const checks = status.checks;
  const { failed, ok, idle } = tally(checks);
  const versionCheck = checks.find((c) => c.id === 'dshVersion');
  const summary =
    failed > 0
      ? t.about.someFailed(failed)
      : idle > 0
        ? t.about.passedSomeUnset(ok, idle)
        : t.about.allPassed(ok);
  const count =
    status.checkedAt === null ? t.about.pending : `${summary} · ${ago(status.checkedAt)}`;

  return (
    <>
      <div className="group-wrap">
        <h2 className="group-head">{t.about.groupVersion}</h2>
        <div className="group">
          {local ? (
            <UpdateRow
              update={update ?? { state: 'checking', current: status.version }}
              onCheck={() => void check()}
              onUpdate={() => void runUpdate()}
            />
          ) : (
            <div className="row">
              <div className="row-main">
                <p className="row-label">{t.about.plugin}</p>
              </div>
              <span className="row-value mono">{status.version}</span>
            </div>
          )}
          <div className="row">
            <div className="row-main">
              <p className="row-label">{t.about.dsh}</p>
            </div>
            <span className="row-value">
              {status.dshVersion === null
                ? t.about.unknownVersion
                : versionCheck?.state === 'warn'
                  ? t.about.dshOutOfRange(status.dshVersion)
                  : t.about.dshInRange(status.dshVersion)}
            </span>
          </div>
          <div className="row">
            <div className="row-main">
              <p className="row-label">{t.about.runtime}</p>
            </div>
            <span className="row-value">
              {t.about.edition[status.edition]} · {t.about.port(status.port)}
            </span>
          </div>
        </div>
      </div>

      <div className="group-wrap">
        <h2 className="group-head">
          <span>
            {t.about.groupChecks} <span className="count">{count}</span>
          </span>
          {local && (
            <button
              type="button"
              className="btn plain sm"
              aria-busy={rechecking || undefined}
              disabled={rechecking}
              onClick={() => void recheck()}
            >
              {rechecking && <Spinner />}
              {rechecking ? t.about.rechecking : t.about.recheck}
            </button>
          )}
        </h2>
        <div className="group">
          {checks.map((c) => (
            <CheckRow key={c.id} c={c} />
          ))}
        </div>
        <p className="group-foot">{t.about.checksFoot}</p>
      </div>
    </>
  );
}
