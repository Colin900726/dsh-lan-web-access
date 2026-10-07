/**
 * 登录页（独立网页）。几种状态：
 * - login 输密码；locked 错太多次，倒计时；
 * - deny 设备不在允许列表，写出它的 IP 和添加方法（403）；
 * - busy dsh 还没准备好，隔几秒自动重试（503）。
 */
/** 登录页上的全部文字。 */
import { ERROR_CODES, LOGIN_RETRY_SECONDS } from "./shared.js";
const TEXT = {
    title: '登录 dsh',
    who: (host) => `${host} 上的 dsh · 局域网访问`,
    thisComputer: '这台电脑',
    password: '管理密码',
    showPassword: '显示密码',
    submit: '登录',
    keep: (days) => `登录后 ${days} 天内不用再输`,
    wrong: (left, wait) => `密码不对。再错 ${left} 次要等 ${wait} 秒`,
    network: '网络错误，请重试',
    failed: '登录没成功，请稍后重试',
    lockedTitle: '稍等一下',
    lockedWho: (n) => `密码连续错了 ${n} 次`,
    lockedButton: (s) => `${s} 秒后再试`,
    forgot: (host) => `忘了密码？<br>在 ${host} 上打开 dsh 设置，<br><span class="nw">进入「局域网web访问 → 安全」重新设置。</span>`,
    denyTitle: '这台设备还没被允许',
    denyWho: (ip) => `它的地址是 <span class="mono strong">${ip}</span>`,
    denySteps: '怎么把这台设备加进来',
    step1: (host) => `在 ${host} 上打开 dsh 设置`,
    step2: '进入「局域网web访问 → 设备」',
    step3: (ip) => `点「添加设备…」，在「最近被拒绝的地址」里点 <span class="mono">${ip}</span>`,
    denyRetry: '已经加好了，重新打开',
    busyTitle: 'dsh 还没准备好',
    busyWho: (host) => `${host} 上的 dsh 正在启动，或局域网入口已暂停`,
    busyAuto: `每 ${LOGIN_RETRY_SECONDS} 秒自动重试`,
    busyRetry: '现在重试',
    insecure: '这是未加密的连接，只在家里、公司内网或 Tailscale 这类组网里使用。',
};
/** HTML 转义。 */
function esc(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
const ICON = {
    wifi: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M1.5 9a15 15 0 0 1 21 0"/><circle cx="12" cy="19.5" r="1"/></svg>',
    lock: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    eye: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    warn: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>',
};
/** 样式（取自设计稿）。 */
const CSS = `
:root { color-scheme: light dark;
  --page: #F2F2F7; --card: #FFFFFF; --text: #1D1D1F; --t2: #3C3C43; --t3: #6E6E73;
  --fill: rgba(118,118,128,0.12); --fill-hover: rgba(118,118,128,0.18); --fill-press: rgba(118,118,128,0.26);
  --acc: #007AFF; --acc-strong: #0071E3; --acc-strong-hover: #006EDB; --acc-strong-press: #0062C4; --focus: rgba(0,122,255,0.40);
  --bad: #D70015; --bad-soft: rgba(255,59,48,0.12); --warn: #C93400; --idle: #8E8E93;
  --spring: cubic-bezier(0.25, 1, 0.5, 1); }
@media (prefers-color-scheme: dark) { :root {
  --page: #1C1C1E; --card: #2C2C2E; --text: #F5F5F7; --t2: #EBEBF5; --t3: #AEAEB2;
  --fill: rgba(118,118,128,0.24); --fill-hover: rgba(118,118,128,0.32); --fill-press: rgba(118,118,128,0.44);
  --acc: #0A84FF; --focus: rgba(10,132,255,0.50); --bad: #FF8A80; --bad-soft: rgba(255,69,58,0.18); --warn: #FFB340; --idle: #636366; } }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { min-height: 100vh; background: var(--page); color: var(--text); -webkit-font-smoothing: antialiased;
  font: 14px/20px -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif; }
main { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 16px; }
[hidden] { display: none !important; }
.card { width: 100%; max-width: 360px; background: var(--card); border-radius: 14px; padding: 32px 24px 24px; display: flex; flex-direction: column; align-items: center; gap: 20px; text-align: center; }
.app { width: 64px; height: 64px; border-radius: 16px; background: var(--acc); color: #fff; display: grid; place-items: center; }
.app.idle { background: var(--idle); }
h1 { margin: 0; font-size: 22px; line-height: 28px; font-weight: 600; letter-spacing: -0.01em; }
h1:focus { outline: none; }
.who { margin: 4px 0 0; font-size: 13px; line-height: 18px; color: var(--t3); }
.mono { font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
.strong { color: var(--text); }
form { width: 100%; display: flex; flex-direction: column; gap: 12px; margin: 0; }
.reveal { position: relative; display: flex; }
.field { flex: 1; height: 40px; border: 0; border-radius: 8px; background: var(--fill); padding: 0 40px 0 12px; font: inherit; color: var(--text); outline: none; transition: box-shadow 100ms, background 100ms; }
.field::placeholder { color: var(--t3); }
.field:hover { background: var(--fill-hover); }
.field:focus { background: var(--fill); box-shadow: 0 0 0 1px var(--acc), 0 0 0 4px var(--focus); }
.field[aria-invalid="true"] { box-shadow: 0 0 0 1px var(--bad), 0 0 0 4px var(--bad-soft); }
.field:disabled { opacity: 0.5; }
.eye { position: absolute; right: 6px; top: 6px; width: 28px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--t3); display: grid; place-items: center; cursor: pointer; }
.eye:hover { background: var(--fill); color: var(--text); }
.btn { height: 40px; border: 0; border-radius: 8px; padding: 0 16px; font: inherit; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: var(--fill); color: var(--text); transition: transform 100ms ease-out, background 100ms ease-out; }
.btn:hover { background: var(--fill-hover); }
.btn:active { background: var(--fill-press); transform: scale(0.97); }
.btn.primary { width: 100%; background: var(--acc-strong); color: #fff; }
.btn.primary:hover { background: var(--acc-strong-hover); }
.btn.primary:active { background: var(--acc-strong-press); }
.btn:disabled { opacity: 0.4; cursor: default; transform: none; }
:where(button, input):focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
.spin { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid currentColor; border-right-color: transparent; animation: spin 700ms linear infinite; display: none; }
.btn[aria-busy="true"] .spin, .msg .spin { display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }
.note { margin: 0; font-size: 12px; line-height: 18px; color: var(--t3); text-wrap: balance; }
.note .nw { white-space: nowrap; }
.msg { margin: 0; min-height: 16px; font-size: 12px; line-height: 16px; color: var(--t3); display: flex; align-items: center; justify-content: center; gap: 6px; }
.msg.bad { color: var(--bad); }
.steps { list-style: none; margin: 0; padding: 12px 16px; width: 100%; background: var(--page); border-radius: 12px; display: flex; flex-direction: column; gap: 12px; text-align: left; }
.steps li { display: flex; gap: 12px; align-items: flex-start; font-size: 13px; line-height: 18px; color: var(--t2); }
.steps .n { width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%; background: var(--acc); color: #fff; font-size: 11px; font-weight: 600; line-height: 18px; text-align: center; }
.steps .mono { color: var(--text); }
.foot { margin: 20px 0 0; max-width: 300px; font-size: 12px; line-height: 16px; color: var(--t3); display: flex; gap: 6px; align-items: flex-start; }
.foot svg { color: var(--warn); flex-shrink: 0; margin-top: 1px; }
.shake { animation: shake 360ms var(--spring); }
@keyframes shake { 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; } .shake { animation: none; } }
`;
function card(icon, iconClass, title, who, body, panel, hidden) {
    return `<section class="card" data-panel="${panel}"${hidden ? ' hidden' : ''}>
  <div class="app${iconClass}">${icon}</div>
  <div><h1 tabindex="-1">${title}</h1><p class="who">${who}</p></div>
  ${body}
</section>`;
}
/** 生成登录页 HTML。 */
export function loginPageHtml(view) {
    const host = esc(view.host.trim() || TEXT.thisComputer);
    let cards;
    let script = '';
    if (view.state === 'deny') {
        const ip = esc(view.ip);
        cards = card(ICON.lock, ' idle', TEXT.denyTitle, TEXT.denyWho(ip), `<ol class="steps" aria-label="${TEXT.denySteps}">
    <li><span class="n">1</span><span>${TEXT.step1(host)}</span></li>
    <li><span class="n">2</span><span>${TEXT.step2}</span></li>
    <li><span class="n">3</span><span>${TEXT.step3(ip)}</span></li>
  </ol>
  <button class="btn" type="button" onclick="location.reload()">${TEXT.denyRetry}</button>`, 'deny', false);
    }
    else if (view.state === 'busy') {
        cards = card(ICON.wifi, ' idle', TEXT.busyTitle, TEXT.busyWho(host), `<p class="msg"><span class="spin"></span>${TEXT.busyAuto}</p>
  <button class="btn" type="button" onclick="location.reload()">${TEXT.busyRetry}</button>`, 'busy', false);
        script = `setTimeout(function () { location.reload(); }, ${LOGIN_RETRY_SECONDS * 1000});`;
    }
    else {
        const locked = view.state === 'locked';
        cards =
            card(ICON.wifi, '', TEXT.title, TEXT.who(host), `<form id="f" novalidate>
    <div class="reveal" id="r"><input class="field" id="p" type="password" placeholder="${TEXT.password}" aria-label="${TEXT.password}" autocomplete="current-password" aria-describedby="m" autofocus><button class="eye" type="button" id="e" aria-label="${TEXT.showPassword}" aria-pressed="false">${ICON.eye}</button></div>
    <button class="btn primary" type="submit" id="b"><span class="spin"></span>${TEXT.submit}</button>
    <p class="note" id="k">${TEXT.keep(view.days)}</p>
    <p class="msg bad" id="m" role="alert" hidden></p>
  </form>`, 'login', locked) +
                card(ICON.lock, '', TEXT.lockedTitle, TEXT.lockedWho(view.maxFailures), `<form novalidate>
    <div class="reveal"><input class="field" type="password" disabled placeholder="${TEXT.password}" aria-label="${TEXT.password}"></div>
    <button class="btn primary" type="button" id="lb" disabled></button>
    <p class="note">${TEXT.forgot(host)}</p>
  </form>`, 'locked', !locked);
        // 脚本里要用的句子从 TEXT 传进去，{n} 由脚本填。
        const t = JSON.stringify({
            wrong: TEXT.wrong('{n}', view.lockSeconds),
            lockedButton: TEXT.lockedButton('{n}'),
            network: TEXT.network,
            failed: TEXT.failed,
            maxFailures: view.maxFailures,
            lockSeconds: view.lockSeconds,
            codes: { locked: ERROR_CODES.locked, wrong: ERROR_CODES.wrongPassword },
        }).replace(/</g, '\\u003c');
        script = `
(function () {
  var T = ${t};
  var f = document.getElementById('f'), p = document.getElementById('p'), b = document.getElementById('b'),
      m = document.getElementById('m'), r = document.getElementById('r'), k = document.getElementById('k'),
      lb = document.getElementById('lb');
  var cards = { login: document.querySelector('[data-panel=login]'), locked: document.querySelector('[data-panel=locked]') };
  function fill(tpl, n) { return tpl.replace('{n}', String(n)); }
  function show(name) {
    cards.login.hidden = name !== 'login'; cards.locked.hidden = name !== 'locked';
    // 换卡片时焦点跟过去，读屏软件会念新标题。
    if (name === 'locked') cards.locked.querySelector('h1').focus();
  }
  function lock(seconds) {
    show('locked');
    var left = Math.max(1, seconds | 0);
    (function tick() {
      lb.textContent = fill(T.lockedButton, left);
      if (left <= 0) { show('login'); m.hidden = true; k.hidden = false; p.value = ''; p.removeAttribute('aria-invalid'); p.focus(); return; }
      left -= 1; setTimeout(tick, 1000);
    })();
  }
  var e = document.getElementById('e');
  e.addEventListener('click', function () {
    var reveal = p.type === 'password';
    p.type = reveal ? 'text' : 'password';
    e.setAttribute('aria-pressed', reveal ? 'true' : 'false');
    p.focus();
  });
  p.addEventListener('input', function () { p.removeAttribute('aria-invalid'); });
  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (b.disabled) return;
    // 空着不提交，免得白白算错一次。
    if (p.value === '') { p.focus(); return; }
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    fetch('/api/remote-access/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: p.value }) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { status: res.status, d: d }; }); })
      .then(function (x) {
        b.disabled = false; b.removeAttribute('aria-busy');
        if (x.status === 200) { location.replace('/'); return; }
        if (x.d && x.d.code === T.codes.locked) { lock(x.d.retryAfter || T.lockSeconds); return; }
        if (x.d && x.d.code === T.codes.wrong) {
          p.setAttribute('aria-invalid', 'true'); p.select();
          r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake');
          k.hidden = true; m.hidden = false; m.textContent = fill(T.wrong, x.d.remaining);
          return;
        }
        // 设备被移出列表（403）、dsh 暂停了（503）：重新加载，让服务端给出对的那一页。
        if (x.status === 403 || x.status === 503) { location.reload(); return; }
        k.hidden = true; m.hidden = false; m.textContent = T.failed;
      })
      .catch(function () { b.disabled = false; b.removeAttribute('aria-busy'); k.hidden = true; m.hidden = false; m.textContent = T.network; });
  });
  ${locked ? `lock(${Math.max(1, view.retryAfter | 0)});` : ''}
})();`;
    }
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${TEXT.title}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${cards}
<p class="foot">${ICON.warn}<span>${TEXT.insecure}</span></p>
</main>
<script>${script}</script>
</body>
</html>`;
}
