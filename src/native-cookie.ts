/**
 * dsh 原生浏览器认证 Cookie 补签。
 *
 * dsh 0.1.2+ 的 Host 侧对 `/api` 与 index.html 强制校验一条按 authority 签名
 * 的 cookie、且不豁免回环。本模块按该协议逐字节一致的格式，为「本插件已判定为
 * 可信」的请求现场签发这条 cookie，从而让可信请求跳过「每次启动都变的 token URL」。
 *
 * 协议要点（以 dsh 运行时实际行为为准，升级 dsh 大版本后需复核）：
 * - cookie 名 = `dsh-auth-` + base64url(sha256(authority))
 * - cookie 值 = `v1.` + base64url(JSON payload) + `.` + base64url(HMAC-SHA256(secret, body))
 * - payload = `{ version:1, authority, issuedAt, expiresAt }`
 * - 签名密钥持久化在 credentials 记录 `client-connection/browser-session`
 *   （kind 为 grant，32 字节，base64url 编码；只读，绝不自行创建）
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { rawService } from './cordis-raw.ts';
import { credentialKey } from '@deepseek-ai/dsh-credentials';

export const NATIVE_COOKIE_PREFIX = 'dsh-auth-';
export const NATIVE_COOKIE_VERSION = 1;
export const SIGNING_SECRET_BYTES = 32;
/** 与运行时默认 cookie 有效期一致（30 天）。 */
export const NATIVE_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60;
/** 运行时持久化浏览器会话签名密钥的 credentials 记录 key。 */
export const SIGNING_SECRET_RECORD = credentialKey('client-connection', 'browser-session');

/** 结构性 credentials 形状（不声明类型合并，避免依赖未安装的类型包）。 */
export interface CredentialsLike {
  readRecord(key: unknown): Promise<unknown>;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** 规范化请求 authority：URL 语义下的小写 host，去掉默认端口。 */
export function authorityOf(headers: IncomingMessage['headers']): string | undefined {
  const host = headers.host;
  if (!host) return undefined;
  try {
    return new URL(`http://${host}`).host;
  } catch {
    return undefined;
  }
}

/** 原生 cookie 名（`dsh-auth-` + base64url(sha256(authority))）。 */
export function nativeCookieName(authority: string): string {
  return NATIVE_COOKIE_PREFIX + b64url(createHash('sha256').update(authority).digest());
}

/** 从 Cookie 头精确取出指定名字的值（单 cookie，不做通用解码）。 */
export function readNativeCookie(
  headers: IncomingMessage['headers'],
  authority: string,
): string | undefined {
  const header = headers.cookie;
  if (!header) return undefined;
  const target = nativeCookieName(authority);
  for (const segment of header.split(';')) {
    const eq = segment.indexOf('=');
    if (eq === -1) continue;
    if (segment.slice(0, eq).trim() === target) return segment.slice(eq + 1).trim();
  }
  return undefined;
}

/**
 * 按 credentials 服务实例缓存的上游签名密钥（密钥归 connection 插件所有）。
 * 只缓存一分钟：dsh 运行中换了密钥，一分钟内就会读到新的；运行检查第 2 项也会跟着反映真实情况。
 */
const secretCache = new WeakMap<object, { secret: Buffer; at: number }>();
/**
 * 最近一次读到的密钥。经 ctx 拿到的 credentials 是 cordis 代理，每次拿都可能是新包的一层，
 * 按代理当键永远找不到（2026-10-07 Desktop 真机踩到：同步校验时总是「还没读到」）。缓存改按原对象当键，
 * 另外记一份最近读到的：一个进程只有一份 dsh 签名密钥。
 */
let latestSecret: Buffer | undefined;
const SECRET_CACHE_MS = 60_000;

/**
 * 读取上游浏览器会话签名密钥；只读不建。密钥记录格式不符或尚未生成时返回
 * undefined（调用方跳过本次补签、下次重试）。
 */
export async function loadSigningSecret(
  credentials: CredentialsLike | undefined,
): Promise<Buffer | undefined> {
  if (credentials === undefined) return undefined;
  const cached = secretCache.get(rawService(credentials));
  if (cached !== undefined && Date.now() - cached.at < SECRET_CACHE_MS) return cached.secret;
  try {
    const record = (await credentials.readRecord(SIGNING_SECRET_RECORD)) as
      { kind?: unknown; payload?: unknown } | undefined;
    if (record === undefined || record === null) return undefined;
    if (record.kind !== 'grant' || record.payload === null || typeof record.payload !== 'object')
      return undefined;
    const payload = record.payload as { version?: unknown; secret?: unknown };
    if (payload.version !== NATIVE_COOKIE_VERSION || typeof payload.secret !== 'string')
      return undefined;
    const secret = Buffer.from(payload.secret, 'base64url');
    if (secret.length !== SIGNING_SECRET_BYTES) return undefined;
    secretCache.set(rawService(credentials), { secret, at: Date.now() });
    latestSecret = secret;
    return secret;
  } catch {
    return undefined;
  }
}

/**
 * 已经读到过的签名密钥（不过期、不发起读取）。请求校验是同步的，用它；还没读到时顺手发起一次读取，
 * 下一个请求就能用上。读不到就返回 undefined，调用方按「不认」处理（安全关闭）。
 */
export function peekSigningSecret(credentials: CredentialsLike | undefined): Buffer | undefined {
  if (credentials === undefined) return undefined;
  const secret = secretCache.get(rawService(credentials))?.secret ?? latestSecret;
  if (secret === undefined) void loadSigningSecret(credentials);
  return secret;
}

/**
 * 校验一条原生 cookie 值：签名对、authority 对得上、没过期，返回其 payload；否则 undefined。
 * 和 dsh 自己的校验规则一致（见文件头的协议要点）。
 */
export function verifyNativeCookie(
  value: string,
  secret: Buffer,
  authority: string,
  now = Date.now(),
): { issuedAt: number; expiresAt: number } | undefined {
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return undefined;
  const [, body, signature] = parts as [string, string, string];
  const expected = createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(signature, 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return undefined;
  let payload: { version?: unknown; authority?: unknown; issuedAt?: unknown; expiresAt?: unknown };
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as typeof payload;
  } catch {
    return undefined;
  }
  if (payload.version !== NATIVE_COOKIE_VERSION || payload.authority !== authority)
    return undefined;
  if (typeof payload.issuedAt !== 'number' || typeof payload.expiresAt !== 'number')
    return undefined;
  // 与 dsh 自己的校验一致：签发不晚于现在、没过期、有效期不超过 30 天。
  if (payload.issuedAt > now || payload.expiresAt <= now) return undefined;
  if (payload.expiresAt <= payload.issuedAt) return undefined;
  if (payload.expiresAt - payload.issuedAt > NATIVE_COOKIE_MAX_AGE_SEC * 1000) return undefined;
  return { issuedAt: payload.issuedAt, expiresAt: payload.expiresAt };
}

/** cookie 值的指纹（记「插件签发过哪些」时只存它，不存 cookie 本身）。 */
export function nativeCookieFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

/** 从 `Set-Cookie` 串里取出 cookie 值。 */
export function setCookieValue(setCookie: string): string {
  const eq = setCookie.indexOf('=');
  const semi = setCookie.indexOf(';');
  return setCookie.slice(eq + 1, semi === -1 ? undefined : semi);
}

/** 序列化原生 cookie 值（`v1.<payload>.<hmac>`）。 */
export function serializeNativeCookie(
  payload: { version: number; authority: string; issuedAt: number; expiresAt: number },
  secret: Buffer,
): string {
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(body).digest().toString('base64url');
  return `v1.${body}.${signature}`;
}

/** 原生 cookie 的属性串（HttpOnly + Strict，跨 30 天）。 */
export function nativeCookieAttributes(expiresAt: number): string {
  return `; Max-Age=${String(NATIVE_COOKIE_MAX_AGE_SEC)}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; SameSite=Strict`;
}

/** 为某个 authority 签发一条原生 cookie 的 `Set-Cookie` 值。 */
export function issueNativeCookie(secret: Buffer, authority: string, now = Date.now()): string {
  const expiresAt = now + NATIVE_COOKIE_MAX_AGE_SEC * 1000;
  const value = serializeNativeCookie(
    { version: NATIVE_COOKIE_VERSION, authority, issuedAt: now, expiresAt },
    secret,
  );
  return `${nativeCookieName(authority)}=${value}${nativeCookieAttributes(expiresAt)}`;
}

/** 清除某 authority 的原生 cookie（名字可推导、无需 secret）。 */
export function expireNativeCookie(authority: string): string {
  return `${nativeCookieName(authority)}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`;
}

/**
 * 200 跳板页：补签走 200 + `Set-Cookie` + 自导航，而非 3xx。
 * 原因是 3xx 响应里新设的 cookie 不会被浏览器带给重定向目标，逐跳重放会走到
 * ERR_TOO_MANY_REDIRECTS。
 */
export function bouncePage(url: string): string {
  const attr = url
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const scriptTarget = JSON.stringify(url).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><title>Redirecting…</title><script>location.replace(${scriptTarget})</script><meta http-equiv="refresh" content="0;url=${attr}">`;
}

/** 请求是否像文档导航（而非 XHR/fetch）。 */
export function isDocumentNavigation(req: IncomingMessage): boolean {
  const mode = req.headers['sec-fetch-mode'];
  if (typeof mode === 'string') return mode === 'navigate' || mode === 'nested-navigate';
  const accept = req.headers.accept;
  return typeof accept === 'string' && accept.includes('text/html');
}
