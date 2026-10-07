/**
 * 登录：主服务和局域网入口共用。
 * 被锁 → 429 + 还要等几秒；密码错 → 401 + 还能错几次；成功 → 发登录 cookie、记访问记录。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loginPageHtml, type LoginView } from './login-page.ts';
import type { Runtime } from './runtime.ts';
export declare function handleLoginPost(rt: Runtime, req: IncomingMessage, res: ServerResponse, opts: {
    ip: string;
    exempt: boolean;
    extraCookies?: () => Promise<string[]>;
}): Promise<void>;
/** 登录页当前该显示哪一种（被锁时直接显示倒计时）。 */
export declare function loginView(rt: Runtime, ip: string, exempt: boolean): LoginView;
export declare function sendHtml(res: ServerResponse, status: number, html: string): void;
export { loginPageHtml };
