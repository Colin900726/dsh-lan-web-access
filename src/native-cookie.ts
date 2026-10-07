/**
 * dsh 的登录 cookie：插件放行的请求，按 dsh 的格式补签一条，这样就不需要 token 链接。
 *
 * 格式（照 dsh 的实现，dsh 升大版本后要复核）：
 * - 名字：`dsh-auth-` + base64url(sha256(地址))
 * - 值：`v1.` + base64url(JSON{version, authority, issuedAt, expiresAt}) + `.` + base64url(HMAC-SHA256)
 * - 签名密钥在 dsh 的 credentials 记录 `client-connection/browser-session` 里，只读不建。
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { rawService } from './cordis-raw.ts';
import { credentialKey } from '@deepseek-ai/dsh-credentials';

export const NATIVE_COOKIE_PREFIX = 'dsh-auth-';
export const NATIVE_COOKIE_VERSION = 1;
export const SIGNING_SECRET_BYTES = 32;
/** 有效期 30 天，和 dsh 一致。 */
export const NATIVE_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60;
/** 签名密钥所在的 credentials 记录。 */
export const SIGNING_SECRET_RECORD = credentialKey('client-connection', 'browser-session');

/** 用到的 credentials 接口（只声明需要的部分）。 */
export interface CredentialsLike {
  readRecord(key: unknown): Promise<unknown>;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** 请求的地址（小写 host:端口，去掉默认端口）。 */
export function authorityOf(headers: IncomingMessage['headers']): string | undefined {
  const host = headers.host;
  if (!host) return undefined;
  try {
    return new URL(`http://${host}`).host;
  } catch {
    return undefined;
  }
}

/** cookie 名。 */
export function nativeCookieName(authority: string): string {
  return NATIVE_COOKIE_PREFIX + b64url(createHash('sha256').update(authority).digest());
}

/** 从 Cookie 头里取出这条 cookie 的值。 */
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

/** 读到的签名密钥，缓存一分钟（dsh 换了密钥，一分钟内能读到新的）。 */
const secretCache = new WeakMap<object, { secret: Buffer; at: number }>();
/** 最近一次读到的密钥。credentials 每次拿到的都是新的代理对象，缓存按原对象当键，再备一份这个。 */
let latestSecret: Buffer | undefined;
const SECRET_CACHE_MS = 60_000;

/** 读取 dsh 的签名密钥，只读不建；读不到返回 undefined。 */
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

/** 同步取已读到的密钥；还没读到就顺手开始读，这次返回 undefined（按不认处理）。 */
export function peekSigningSecret(credentials: CredentialsLike | undefined): Buffer | undefined {
  if (credentials === undefined) return undefined;
  const secret = secretCache.get(rawService(credentials))?.secret ?? latestSecret;
  if (secret === undefined) void loadSigningSecret(credentials);
  return secret;
}

/** 校验 cookie：签名、地址、有效期都对，返回签发和过期时间；否则 undefined。规则和 dsh 一致。 */
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
  if (payload.issuedAt > now || payload.expiresAt <= now) return undefined;
  if (payload.expiresAt <= payload.issuedAt) return undefined;
  if (payload.expiresAt - payload.issuedAt > NATIVE_COOKIE_MAX_AGE_SEC * 1000) return undefined;
  return { issuedAt: payload.issuedAt, expiresAt: payload.expiresAt };
}

/** cookie 的指纹（只存指纹，不存 cookie 本身）。 */
export function nativeCookieFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

/** 从 `Set-Cookie` 串里取出 cookie 值。 */
export function setCookieValue(setCookie: string): string {
  const eq = setCookie.indexOf('=');
  const semi = setCookie.indexOf(';');
  return setCookie.slice(eq + 1, semi === -1 ? undefined : semi);
}

/** 生成 cookie 值。 */
export function serializeNativeCookie(
  payload: { version: number; authority: string; issuedAt: number; expiresAt: number },
  secret: Buffer,
): string {
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(body).digest().toString('base64url');
  return `v1.${body}.${signature}`;
}

/** cookie 属性（HttpOnly、SameSite=Strict、30 天）。 */
export function nativeCookieAttributes(expiresAt: number): string {
  return `; Max-Age=${String(NATIVE_COOKIE_MAX_AGE_SEC)}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; SameSite=Strict`;
}

/** 签发一条 cookie，返回 `Set-Cookie` 的值。 */
export function issueNativeCookie(secret: Buffer, authority: string, now = Date.now()): string {
  const expiresAt = now + NATIVE_COOKIE_MAX_AGE_SEC * 1000;
  const value = serializeNativeCookie(
    { version: NATIVE_COOKIE_VERSION, authority, issuedAt: now, expiresAt },
    secret,
  );
  return `${nativeCookieName(authority)}=${value}${nativeCookieAttributes(expiresAt)}`;
}

/** 清除这个地址的 cookie。 */
export function expireNativeCookie(authority: string): string {
  return `${nativeCookieName(authority)}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`;
}

/** 补签用的跳板页：返回 200 再自己跳转。用 3xx 的话新 cookie 带不过去，会无限重定向。 */
export function bouncePage(url: string): string {
  const attr = url
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const scriptTarget = JSON.stringify(url).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><title>Redirecting…</title><script>location.replace(${scriptTarget})</script><meta http-equiv="refresh" content="0;url=${attr}">`;
}

/** 是不是浏览器打开页面（而不是脚本发的请求）。 */
export function isDocumentNavigation(req: IncomingMessage): boolean {
  const mode = req.headers['sec-fetch-mode'];
  if (typeof mode === 'string') return mode === 'navigate' || mode === 'nested-navigate';
  const accept = req.headers.accept;
  return typeof accept === 'string' && accept.includes('text/html');
}
