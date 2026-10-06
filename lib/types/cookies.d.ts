/**
 * 会话 cookie 的 HTTP 层序列化/解析（`dsh_sid`）。
 */
import type { IncomingMessage } from 'node:http';
export declare const SESSION_COOKIE = "dsh_sid";
/** 从 Cookie 头精确读取指定名字的值（按 `;` 分段比较名字，避免误匹配子串）。 */
export declare function parseCookieValue(header: string | undefined, name: string): string | undefined;
export declare function readSessionToken(req: IncomingMessage): string | undefined;
export declare function sessionCookieSet(token: string, maxAgeSec: number): string;
export declare function sessionCookieClear(): string;
