/**
 * 设置页样式（值来自 设计稿，苹果系统色）。
 * 全部挂在 .dla 根节点下，不影响 dsh 其他页面；深色跟随 dsh 自己的主题开关
 * （body[data-ds-dark-theme]），不看系统设置，保证和设置窗口一致。
 */
export const ROOT_CLASS = 'dla';

export const css = `
.dla {
  --bg: transparent;
  --group: #F2F2F7;
  --hover: rgba(0, 0, 0, 0.04);
  --press: rgba(0, 0, 0, 0.08);
  --fill: rgba(118, 118, 128, 0.12);
  --fill-hover: rgba(118, 118, 128, 0.18);
  --fill-press: rgba(118, 118, 128, 0.26);
  --sep: rgba(60, 60, 67, 0.18);
  --text: #1D1D1F;
  --t2: #3C3C43;
  --t3: #6E6E73;
  --acc: #007AFF;
  --acc-strong: #0071E3;
  --acc-strong-hover: #006EDB;
  --acc-strong-press: #0062C4;
  --acc-text: #0066CC;
  --acc-soft: rgba(0, 122, 255, 0.12);
  --focus: rgba(0, 122, 255, 0.40);
  --ok-dot: #34C759;
  --ok: #1E7A34;
  --warn: #C93400;
  --warn-soft: rgba(255, 149, 0, 0.15);
  --chevron: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236E6E73' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  --bad: #D70015;
  --bad-dot: #FF3B30;
  --idle-dot: #8E8E93;
  --switch-off: rgba(120, 120, 128, 0.20);
  --seg-on: #FFFFFF;
  --toast-bg: #1D1D1F;
  --toast-fg: #FFFFFF;
  --sheet-bg: #FFFFFF;
  --scrim: rgba(0, 0, 0, 0.28);
  --bad-soft: rgba(255, 59, 48, 0.12);
  --warn-dot: #FF9500;
  --shadow-knob: 0 0 0 0.5px rgba(0, 0, 0, 0.04), 0 2px 4px rgba(0, 0, 0, 0.18);
  --shadow-seg: 0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.10);
  --shadow-pop: 0 0 0 0.5px rgba(0, 0, 0, 0.12), 0 20px 50px rgba(0, 0, 0, 0.18);
  --mono: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
  --dur: 220ms; --dur-press: 100ms; --spring: cubic-bezier(0.25, 1, 0.5, 1);
  display: flex; flex-direction: column; gap: 24px;
  width: 100%; color: var(--text);
  font: 14px/20px -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  /* dsh 页面打开了中英文自动加空格（text-autospace: normal），会把「局域网web访问」排成「局域网 web 访问」、
     行也跟着变长；设计稿是不加的，插件区域里关掉。 */
  text-autospace: no-autospace;
}
body[data-ds-dark-theme] .dla {
  --group: #3A3A3C;
  --hover: rgba(255, 255, 255, 0.05);
  --press: rgba(255, 255, 255, 0.10);
  --fill: rgba(118, 118, 128, 0.24);
  --fill-hover: rgba(118, 118, 128, 0.32);
  --fill-press: rgba(118, 118, 128, 0.44);
  --sep: rgba(84, 84, 88, 0.65);
  --text: #F5F5F7; --t2: #EBEBF5; --t3: #AEAEB2;
  --acc: #0A84FF; --acc-text: #6CB4FF;
  --acc-soft: rgba(10, 132, 255, 0.22); --focus: rgba(10, 132, 255, 0.50);
  --ok-dot: #30D158; --ok: #30D158; --warn: #FFB340; --warn-soft: rgba(255, 159, 10, 0.18);
  --chevron: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23AEAEB2' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  --bad: #FF8A80; --bad-dot: #FF453A; --idle-dot: #636366;
  --switch-off: rgba(120, 120, 128, 0.36); --seg-on: #636366;
  --toast-bg: #F5F5F7; --toast-fg: #1D1D1F;
  --sheet-bg: #2C2C2E; --scrim: rgba(0, 0, 0, 0.5); --bad-soft: rgba(255, 69, 58, 0.18); --warn-dot: #FF9F0A;
  --shadow-knob: 0 2px 4px rgba(0, 0, 0, 0.4);
  --shadow-seg: 0 0 0 0.5px rgba(255, 255, 255, 0.06), 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-pop: 0 0 0 0.5px rgba(255, 255, 255, 0.10), 0 20px 50px rgba(0, 0, 0, 0.55);
}
.dla *, .dla *::before, .dla *::after { box-sizing: border-box; }
/* dsh 给所有元素设了 corner-shape: superellipse(1.5)（圆角画成偏方的超椭圆），圆形图标会变成圆角方块、
   按钮和卡片的圆角也变方；设计稿是普通圆角，插件区域里改回 round。 */
.dla, .dla *, .dla *::before, .dla *::after { corner-shape: round; }
/* 自己的 display 规则优先级高于浏览器默认的 [hidden]，这里压回去，不依赖宿主。 */
.dla [hidden] { display: none !important; }
.dla p { margin: 0; }
.dla button { font: inherit; color: inherit; }
.dla :where(button, a, input, select):focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
.dla .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }

.dla .hero { display: flex; align-items: center; gap: 16px; padding: 20px 16px; background: var(--group); border-radius: 12px; }
.dla .hero-icon { width: 48px; height: 48px; border-radius: 12px; background: var(--acc); color: #fff; display: grid; place-items: center; flex-shrink: 0; transition: background var(--dur) var(--spring); }
.dla .hero.off .hero-icon { background: var(--idle-dot); }
.dla .hero.fault .hero-icon { background: var(--bad-dot); }
.dla .hero-body { flex: 1; min-width: 0; }
.dla .hero-title { margin: 0; font-size: 22px; line-height: 28px; font-weight: 600; letter-spacing: -0.01em; }
.dla .hero-sub { margin-top: 2px; font-size: 13px; line-height: 18px; color: var(--t2); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
/* 窗口很窄、状态一行放不下时：圆点留在第一行文字旁边，不单独占一行（设计稿只画了正常宽度）。 */
.dla .hero-sub { flex-wrap: nowrap; align-items: flex-start; }
.dla .hero-sub > .dot { margin-top: 5px; }

.dla .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; background: var(--idle-dot); }
.dla .dot.ok { background: var(--ok-dot); }
.dla .dot.bad { background: var(--bad-dot); }
.dla .dot.acc { background: var(--acc); }

.dla .seg { display: flex; padding: 2px; gap: 2px; border-radius: 8px; background: var(--fill); }
.dla .seg button { flex: 1; height: 28px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 6px; background: none; font-size: 13px; color: var(--t2); cursor: pointer; transition: background var(--dur) var(--spring), color var(--dur); }
.dla .seg button:hover:not([aria-selected="true"]) { background: var(--hover); color: var(--text); }
.dla .seg button:active:not([aria-selected="true"]) { background: var(--press); }
.dla .seg button[aria-selected="true"] { background: var(--seg-on); color: var(--text); font-weight: 600; box-shadow: var(--shadow-seg); }

.dla .panel { display: flex; flex-direction: column; gap: 24px; }
.dla .group-wrap { display: flex; flex-direction: column; gap: 8px; }
.dla .group-head { margin: 0; padding: 0 16px; font-size: 13px; line-height: 18px; font-weight: 600; color: var(--t2); }
.dla .t3 { color: var(--t3); }
.dla .group { background: var(--group); border-radius: 12px; overflow: hidden; transition: opacity var(--dur) var(--spring); }
.dla .group.dim { opacity: 0.45; pointer-events: none; }
.dla .group-foot { margin: 0; padding: 0 16px; font-size: 12px; line-height: 16px; color: var(--t3); }
.dla .row { position: relative; display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 8px 16px; }
.dla .row + .row::before { content: ""; position: absolute; top: 0; left: 16px; right: 0; height: 0.5px; background: var(--sep); }
.dla .row-main { flex: 1; min-width: 0; }
.dla .row-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dla .row-desc { margin-top: 2px; font-size: 12px; line-height: 16px; color: var(--t3); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dla .row-desc.bad { color: var(--bad); }
.dla .row-value { color: var(--t3); font-size: 13px; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.dla .row-addr { margin-top: 2px; display: flex; align-items: center; gap: 2px; }
.dla .row-addr .mono { font-size: 12px; color: var(--text); }

.dla .switch { position: relative; width: 38px; height: 22px; flex-shrink: 0; border: 0; padding: 0; border-radius: 999px; background: var(--switch-off); cursor: pointer; transition: background var(--dur) var(--spring), filter var(--dur-press); }
.dla .switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 999px; background: #fff; box-shadow: var(--shadow-knob); transition: transform var(--dur) var(--spring), width var(--dur-press) ease-out; }
.dla .switch::before { content: ""; position: absolute; inset: -11px 0; }
.dla .switch:hover { filter: brightness(0.96); }
.dla .switch[aria-checked="true"] { background: var(--acc); }
.dla .switch[aria-checked="true"]::after { transform: translateX(16px); }
.dla .switch:active::after { width: 22px; }
.dla .switch[aria-checked="true"]:active::after { transform: translateX(12px); }
.dla .switch:disabled { opacity: 0.4; cursor: default; filter: none; }
.dla .switch[aria-busy="true"] { cursor: progress; }
.dla .switch[aria-busy="true"]::after { animation: dla-pulse 900ms ease-in-out infinite; }
@keyframes dla-pulse { 50% { opacity: 0.6; } }

.dla .row-end { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.dla .row-end.addr { gap: 4px; margin-right: -4px; }
.dla .row-end.addr .mono { font-size: 13px; color: var(--text); }
.dla .row-desc.ok { color: var(--ok); }
.dla .field { height: 32px; border: 0; border-radius: 8px; background: var(--fill); padding: 0 12px; font: inherit; font-size: 13px; color: var(--text); outline: none; transition: box-shadow var(--dur-press), background var(--dur-press); min-width: 0; }
.dla .field:hover { background: var(--fill-hover); }
.dla .field:focus { background: var(--fill); box-shadow: 0 0 0 1px var(--acc), 0 0 0 4px var(--focus); }
.dla .field[aria-invalid="true"] { box-shadow: 0 0 0 1px var(--bad), 0 0 0 4px rgba(255, 59, 48, 0.12); }
.dla .field.num { width: 88px; text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
.dla .select { appearance: none; -webkit-appearance: none; height: 32px; max-width: 60%; border: 0; border-radius: 8px; padding: 0 18px 0 8px; margin-right: -2px; font: inherit; font-size: 13px; color: var(--t2); text-align: right; text-align-last: right; cursor: pointer; outline: none; background: transparent var(--chevron) no-repeat right 2px center; transition: background-color var(--dur-press); }
.dla .select:hover { background-color: var(--fill); }
.dla .select:focus-visible { box-shadow: 0 0 0 3px var(--focus); }
.dla .notice.warn { background: var(--warn-soft); }
.dla .notice.bad { background: var(--bad-soft); }
.dla .notice.bad > svg { color: var(--bad); }
.dla .notice-body { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.dla .notice-link { margin: 4px 0 0 -8px; }
.dla .acc-text { color: var(--acc-text); }
.dla .seg .dot { width: 6px; height: 6px; }
.dla .notice.warn > svg { color: var(--warn); }
.dla .group-foot.warn { display: flex; gap: 6px; align-items: flex-start; }
.dla .group-foot.warn > svg { color: var(--warn); flex-shrink: 0; margin-top: 1px; }
.dla .icon-btn { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--t3); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background var(--dur-press); }
.dla .icon-btn:hover { background: var(--fill); color: var(--text); }
.dla .icon-btn:active { background: var(--fill-press); }

.dla .notice { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 12px; background: var(--acc-soft); font-size: 13px; line-height: 18px; }
.dla .notice > svg { color: var(--acc); flex-shrink: 0; margin-top: 1px; }
.dla .notice b { font-weight: 600; display: block; }

.dla .toast-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.dla .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2000; display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 16px; border-radius: 999px; background: var(--toast-bg); color: var(--toast-fg); font-size: 13px; box-shadow: var(--shadow-pop); white-space: nowrap; animation: dla-rise var(--dur) var(--spring); }
.dla .toast .ico { display: inline-flex; color: var(--ok-dot); }
.dla .toast.bad .ico { color: var(--bad-dot); }
@keyframes dla-rise { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translateX(-50%); } }

.dla .group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 26px; }
.dla .group-head .count { font-weight: 400; color: var(--t3); }
.dla button.row { width: 100%; border: 0; background: none; text-align: left; cursor: pointer; color: inherit; font: inherit; transition: background var(--dur-press) ease-out; }
.dla button.row:hover { background: var(--hover); }
.dla button.row:active { background: var(--press); }
.dla button.row:focus-visible { box-shadow: inset 0 0 0 2px var(--acc); }
.dla .row .chev { color: var(--t3); flex-shrink: 0; }
.dla .row.add .row-label, .dla .row.add .plus { color: var(--acc-text); }
.dla .row.danger .row-label { color: var(--bad); }
.dla .row-desc .mono { font-size: inherit; }
.dla .row-desc.inline { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.dla .btn { position: relative; height: 32px; padding: 0 16px; border: 0; border-radius: 8px; background: var(--fill); color: var(--text); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: transform var(--dur-press) ease-out, background var(--dur-press) ease-out; }
.dla .btn:hover { background: var(--fill-hover); }
.dla .btn:active { background: var(--fill-press); transform: scale(0.97); }
.dla .btn.primary { background: var(--acc-strong); color: #fff; }
.dla .btn.primary:hover { background: var(--acc-strong-hover); }
.dla .btn.primary:active { background: var(--acc-strong-press); }
.dla .btn.danger { color: var(--bad); }
.dla .btn.danger:hover { background: var(--bad-soft); }
.dla .btn.danger-solid { background: var(--bad-dot); color: #fff; }
.dla .btn.danger-solid:hover { filter: brightness(0.94); }
.dla .btn.plain { background: none; color: var(--acc-text); padding: 0 8px; }
.dla .btn.plain:hover { background: var(--acc-soft); }
.dla .btn.sm { height: 26px; padding: 0 12px; font-size: 12px; border-radius: 6px; }
.dla .btn.sm.plain { padding: 0 8px; }
.dla .btn:disabled, .dla .btn[aria-disabled="true"] { opacity: 0.4; cursor: default; transform: none; }
.dla .btn:disabled:hover { background: var(--fill); }
.dla .btn.plain:disabled:hover, .dla .btn.danger:disabled:hover { background: none; }
.dla .group-head .btn.plain { margin-right: -6px; }
.dla .spin { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid currentColor; border-right-color: transparent; animation: dla-spin 700ms linear infinite; flex-shrink: 0; }
@keyframes dla-spin { to { transform: rotate(360deg); } }

.dla .chk { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; color: #fff; }
.dla .chk.ok { background: var(--ok-dot); } .dla .chk.warn { background: var(--warn-dot); } .dla .chk.bad { background: var(--bad-dot); } .dla .chk.idle { background: var(--fill); color: var(--t3); }
.dla .badge { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 500; background: var(--fill); color: var(--t2); white-space: nowrap; }
.dla .empty { padding: 24px 16px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.dla .empty p { color: var(--t3); font-size: 13px; line-height: 18px; }
.dla .msg { font-size: 12px; line-height: 16px; color: var(--t3); }
.dla .msg.bad { color: var(--bad); } .dla .msg.ok { color: var(--ok); }

.dla .scrim { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; padding: 16px; background: var(--scrim); animation: dla-fade var(--dur) var(--spring); }
.dla .sheet { width: 100%; max-width: 400px; max-height: calc(100vh - 48px); overflow: auto; background: var(--sheet-bg); border-radius: 14px; box-shadow: var(--shadow-pop); padding: 24px; display: flex; flex-direction: column; gap: 16px; animation: dla-pop var(--dur) var(--spring); }
.dla .sheet.wide { max-width: 480px; }
.dla .sheet:focus { outline: none; }
.dla .sheet h3 { margin: 0; font-size: 15px; line-height: 20px; font-weight: 600; }
.dla .sheet .lead { margin-top: 4px; font-size: 13px; line-height: 18px; color: var(--t2); }
.dla .sheet label.f { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--t2); }
.dla .sheet .field { width: 100%; }
.dla .sheet .sub { font-size: 12px; color: var(--t2); }
.dla .sheet .chips { display: flex; flex-wrap: wrap; gap: 8px; }
.dla .sheet-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.dla .sheet-actions .left { margin-right: auto; }
.dla .chip { height: 26px; padding: 0 12px; border: 0; border-radius: 999px; background: var(--fill); color: var(--text); font: inherit; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background var(--dur-press), transform var(--dur-press); }
.dla .chip:hover { background: var(--fill-hover); }
.dla .chip:active { transform: scale(0.97); background: var(--fill-press); }
.dla .chip[aria-pressed="true"] { background: var(--acc-soft); color: var(--acc-text); }
.dla .chip .mono { font-size: inherit; }
.dla .chip .t3 { color: var(--t3); }
.dla .toast .btn.plain { color: var(--toast-fg); font-weight: 600; }
.dla .toast .btn.plain:hover { background: rgba(127, 127, 127, 0.25); }
.dla .toast.has-undo { padding-right: 6px; }
@keyframes dla-pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes dla-fade { from { opacity: 0; } to { opacity: 1; } }

.dla .row-expand { position: relative; padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 8px; animation: dla-unfold var(--dur) var(--spring); }
.dla .row + .row-expand::before, .dla .row-expand + .row::before { content: ""; position: absolute; top: 0; left: 16px; right: 0; height: 0.5px; background: var(--sep); }
.dla .row-expand .line { display: flex; gap: 8px; align-items: center; }
.dla .reveal { position: relative; flex: 1; display: flex; min-width: 0; }
.dla .reveal .field { flex: 1; padding-right: 36px; }
.dla .reveal .eye { position: absolute; right: 4px; top: 4px; }
.dla .msg.ok svg { vertical-align: -1px; }
.dla .log-list { max-height: 300px; overflow: auto; }
.dla .sheet .seg button { height: 28px; }
@keyframes dla-unfold { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .dla *, .dla *::before, .dla *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}
@media (hover: none) { .dla .icon-btn { color: var(--t2); } }
`;
