/**
 * 登录（R-014 / R-021）：主服务和局域网入口共用这一份，免得两边规则不一致。
 * - 错到上限：429 + locked + retryAfter（还要等几秒）
 * - 密码不对：401 + wrong-password + remaining（还能错几次）；这次正好错到上限就直接回 locked
 * - 成功：发登录 cookie（主服务另附 dsh 原生通行证），记一笔访问记录
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
