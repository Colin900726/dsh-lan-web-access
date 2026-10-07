/** 插件的登录 cookie（`dsh_sid`）。 */
import type { IncomingMessage } from 'node:http';
export declare const SESSION_COOKIE = "dsh_sid";
/** 从 Cookie 头里取出指定名字的值。 */
export declare function parseCookieValue(header: string | undefined, name: string): string | undefined;
export declare function readSessionToken(req: IncomingMessage): string | undefined;
export declare function sessionCookieSet(token: string, maxAgeSec: number): string;
export declare function sessionCookieClear(): string;
