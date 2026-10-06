/**
 * 局域网登录页（R-021），按 设计稿 定稿：独立网页（不在 dsh 窗口里），浅色苹果灰底 + 白卡片、
 * 深色跟随系统。主服务（本机关了免登录时）和局域网入口共用。
 *
 * 五种状态：
 * - login  正常：输密码。密码错时输入框抖一下、说清还能错几次；错到上限切到 locked。
 * - locked 次数太多：按钮倒计时，到点自动恢复。
 * - deny   这台设备不在允许列表：写出它的 IP 和三步添加方法（服务端直接渲染，403）。
 * - busy   dsh 还没准备好（启动中、入口暂停）：每 5 秒自动重试（503）。
 * 电脑名、来访 IP、登录保持天数都按实际填进来，页面上不加任何标记。
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
