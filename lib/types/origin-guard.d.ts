/**
 * 局域网入口的来源检查（R-017 跨站漏洞的修复）。纯函数，无副作用。
 *
 * 入口转发请求前会把 Origin 改写成本机，所以必须在改写之前确认：这个请求是入口自己的页面
 * 发出来的，而不是局域网设备浏览器里打开的别的网站借它的身份发的。否则开着「列表里的设备
 * 免密码」时，任何网页都能控制装 dsh 的电脑。
 *
 * 规则：
 * 1. 地址栏（Host）只认 IP、localhost、本机名、*.local、Tailscale 的 *.ts.net——挡住
 *    「DNS 重绑定」（攻击者让自己的域名解析到局域网 IP，浏览器会把它当同源）。
 * 2. 浏览器带了 Origin：必须和 Host 完全一致（同源）。
 * 3. 浏览器带了 Sec-Fetch-Site：只接受 same-origin / none；跨站只放行「点链接打开页面」
 *    这一种（GET + 文档导航，别的网站拿不到页面内容）。
 * 4. 什么都没带（curl 等非浏览器）：放行——它们不会替别人携带 cookie，不是跨站攻击的载体。
 */
export type OriginVerdict = {
    ok: true;
} | {
    ok: false;
    reason: string;
};
/** 地址栏里的主机名是否可信（不是一个可能被重绑定的任意域名）。 */
export declare function isAllowedHostName(hostHeader: string | undefined, machineName?: string): boolean;
/** 请求是否来自入口自己的页面。upgrade = WebSocket 握手。 */
export declare function checkSameOrigin(req: {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
}, opts?: {
    upgrade?: boolean;
    machineName?: string;
}): OriginVerdict;
