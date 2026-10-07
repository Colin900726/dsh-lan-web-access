/**
 * dsh 的登录 cookie：插件放行的请求，按 dsh 的格式补签一条，这样就不需要 token 链接。
 *
 * 格式（照 dsh 的实现，dsh 升大版本后要复核）：
 * - 名字：`dsh-auth-` + base64url(sha256(地址))
 * - 值：`v1.` + base64url(JSON{version, authority, issuedAt, expiresAt}) + `.` + base64url(HMAC-SHA256)
 * - 签名密钥在 dsh 的 credentials 记录 `client-connection/browser-session` 里，只读不建。
 */
import { NATIVE_COOKIE_MAX_AGE_SEC } from './shared.ts';
import type { IncomingMessage } from 'node:http';
export declare const NATIVE_COOKIE_PREFIX = "dsh-auth-";
export declare const NATIVE_COOKIE_VERSION = 1;
export declare const SIGNING_SECRET_BYTES = 32;
export { NATIVE_COOKIE_MAX_AGE_SEC };
/** 签名密钥所在的 credentials 记录。 */
export declare const SIGNING_SECRET_RECORD: import("@deepseek-ai/dsh-credentials").CredentialKey;
/** 用到的 credentials 接口（只声明需要的部分）。 */
export interface CredentialsLike {
    readRecord(key: unknown): Promise<unknown>;
}
/** 请求的地址（小写 host:端口，去掉默认端口）。 */
export declare function authorityOf(headers: IncomingMessage['headers']): string | undefined;
/** cookie 名。 */
export declare function nativeCookieName(authority: string): string;
/** 从 Cookie 头里取出这条 cookie 的值。 */
export declare function readNativeCookie(headers: IncomingMessage['headers'], authority: string): string | undefined;
export declare function loadSigningSecret(credentials: CredentialsLike | undefined): Promise<Buffer | undefined>;
/** 同步取已读到的密钥；还没读到就顺手开始读，这次返回 undefined（按不认处理）。 */
export declare function peekSigningSecret(credentials: CredentialsLike | undefined): Buffer | undefined;
/** 校验 cookie：签名、地址、有效期都对，返回签发和过期时间；否则 undefined。规则和 dsh 一致。 */
export declare function verifyNativeCookie(value: string, secret: Buffer, authority: string, now?: number): {
    issuedAt: number;
    expiresAt: number;
} | undefined;
/** cookie 的指纹（只存指纹，不存 cookie 本身）。 */
export declare function nativeCookieFingerprint(value: string): string;
/** 从 `Set-Cookie` 串里取出 cookie 值。 */
export declare function setCookieValue(setCookie: string): string;
/** 生成 cookie 值。 */
export declare function serializeNativeCookie(payload: {
    version: number;
    authority: string;
    issuedAt: number;
    expiresAt: number;
}, secret: Buffer): string;
/** cookie 属性（HttpOnly、SameSite=Strict、30 天）。 */
export declare function nativeCookieAttributes(expiresAt: number): string;
/** 签发一条 cookie，返回 `Set-Cookie` 的值。 */
export declare function issueNativeCookie(secret: Buffer, authority: string, now?: number): string;
/** 清除这个地址的 cookie。 */
export declare function expireNativeCookie(authority: string): string;
/** 补签用的跳板页：返回 200 再自己跳转。用 3xx 的话新 cookie 带不过去，会无限重定向。 */
export declare function bouncePage(url: string): string;
/** 是不是浏览器打开页面（而不是脚本发的请求）。 */
export declare function isDocumentNavigation(req: IncomingMessage): boolean;
