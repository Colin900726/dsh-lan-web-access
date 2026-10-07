/**
 * 局域网入口的来源检查：确认请求是入口自己的页面发的，而不是设备浏览器里别的网站借机发的。
 * 否则开着「列表内设备免密码」时，任何网页都能操作装 dsh 的电脑。
 *
 * 规则：
 * 1. 地址栏只认 IP、localhost、本机名、*.local、*.ts.net（防 DNS 重绑定）；
 * 2. 带了 Origin 就必须同源；
 * 3. 带了 Sec-Fetch-Site 就只认同源，跨站只放行「点链接打开页面」；
 * 4. 什么都没带的（curl 等）放行：它们不会替别人带 cookie。
 */
export type OriginVerdict = {
    ok: true;
} | {
    ok: false;
    reason: string;
};
/** 地址栏里的主机名是否可信。 */
export declare function isAllowedHostName(hostHeader: string | undefined, machineName?: string): boolean;
/** 请求是否来自入口自己的页面。upgrade = WebSocket 握手。 */
export declare function checkSameOrigin(req: {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
}, opts?: {
    upgrade?: boolean;
    machineName?: string;
}): OriginVerdict;
