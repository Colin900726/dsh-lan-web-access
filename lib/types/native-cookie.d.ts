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
import type { IncomingMessage } from 'node:http';
export declare const NATIVE_COOKIE_PREFIX = "dsh-auth-";
export declare const NATIVE_COOKIE_VERSION = 1;
export declare const SIGNING_SECRET_BYTES = 32;
/** 与运行时默认 cookie 有效期一致（30 天）。 */
export declare const NATIVE_COOKIE_MAX_AGE_SEC: number;
/** 运行时持久化浏览器会话签名密钥的 credentials 记录 key。 */
export declare const SIGNING_SECRET_RECORD: import("@deepseek-ai/dsh-credentials").CredentialKey;
/** 结构性 credentials 形状（不声明类型合并，避免依赖未安装的类型包）。 */
export interface CredentialsLike {
    readRecord(key: unknown): Promise<unknown>;
}
/** 规范化请求 authority：URL 语义下的小写 host，去掉默认端口。 */
export declare function authorityOf(headers: IncomingMessage['headers']): string | undefined;
/** 原生 cookie 名（`dsh-auth-` + base64url(sha256(authority))）。 */
export declare function nativeCookieName(authority: string): string;
/** 从 Cookie 头精确取出指定名字的值（单 cookie，不做通用解码）。 */
export declare function readNativeCookie(headers: IncomingMessage['headers'], authority: string): string | undefined;
/**
 * 读取上游浏览器会话签名密钥；只读不建。密钥记录格式不符或尚未生成时返回
 * undefined（调用方跳过本次补签、下次重试）。
 */
export declare function loadSigningSecret(credentials: CredentialsLike | undefined): Promise<Buffer | undefined>;
/**
 * 已经读到过的签名密钥（不过期、不发起读取）。请求校验是同步的，用它；还没读到时顺手发起一次读取，
 * 下一个请求就能用上。读不到就返回 undefined，调用方按「不认」处理（安全关闭）。
 */
export declare function peekSigningSecret(credentials: CredentialsLike | undefined): Buffer | undefined;
/**
 * 校验一条原生 cookie 值：签名对、authority 对得上、没过期，返回其 payload；否则 undefined。
 * 和 dsh 自己的校验规则一致（见文件头的协议要点）。
 */
export declare function verifyNativeCookie(value: string, secret: Buffer, authority: string, now?: number): {
    issuedAt: number;
    expiresAt: number;
} | undefined;
/** cookie 值的指纹（记「插件签发过哪些」时只存它，不存 cookie 本身）。 */
export declare function nativeCookieFingerprint(value: string): string;
/** 从 `Set-Cookie` 串里取出 cookie 值。 */
export declare function setCookieValue(setCookie: string): string;
/** 序列化原生 cookie 值（`v1.<payload>.<hmac>`）。 */
export declare function serializeNativeCookie(payload: {
    version: number;
    authority: string;
    issuedAt: number;
    expiresAt: number;
}, secret: Buffer): string;
/** 原生 cookie 的属性串（HttpOnly + Strict，跨 30 天）。 */
export declare function nativeCookieAttributes(expiresAt: number): string;
/** 为某个 authority 签发一条原生 cookie 的 `Set-Cookie` 值。 */
export declare function issueNativeCookie(secret: Buffer, authority: string, now?: number): string;
/** 清除某 authority 的原生 cookie（名字可推导、无需 secret）。 */
export declare function expireNativeCookie(authority: string): string;
/**
 * 200 跳板页：补签走 200 + `Set-Cookie` + 自导航，而非 3xx。
 * 原因是 3xx 响应里新设的 cookie 不会被浏览器带给重定向目标，逐跳重放会走到
 * ERR_TOO_MANY_REDIRECTS。
 */
export declare function bouncePage(url: string): string;
/** 请求是否像文档导航（而非 XHR/fetch）。 */
export declare function isDocumentNavigation(req: IncomingMessage): boolean;
