/**
 * 登录页（独立网页）。几种状态：
 * - login 输密码；locked 错太多次，倒计时；
 * - deny 设备不在允许列表，写出它的 IP 和添加方法（403）；
 * - busy dsh 还没准备好，隔几秒自动重试（503）。
 */
export type LoginView = {
    state: 'login';
    host: string;
    days: number;
    maxFailures: number;
    lockSeconds: number;
} | {
    state: 'locked';
    host: string;
    days: number;
    maxFailures: number;
    lockSeconds: number;
    retryAfter: number;
} | {
    state: 'deny';
    host: string;
    ip: string;
} | {
    state: 'busy';
    host: string;
};
/** 生成登录页 HTML。 */
export declare function loginPageHtml(view: LoginView): string;
