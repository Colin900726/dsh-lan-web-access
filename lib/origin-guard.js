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
import { isIP } from 'node:net';
import { hostname as osHostname } from 'node:os';
/** 地址栏里的主机名是否可信。 */
export function isAllowedHostName(hostHeader, machineName = osHostname()) {
    if (!hostHeader)
        return false;
    let name;
    try {
        name = new URL(`http://${hostHeader}`).hostname.toLowerCase();
    }
    catch {
        return false;
    }
    const bare = name.startsWith('[') && name.endsWith(']') ? name.slice(1, -1) : name;
    if (isIP(bare) !== 0)
        return true;
    if (bare === 'localhost')
        return true;
    const machine = machineName.toLowerCase().replace(/\.local$/, '');
    if (bare === machine || bare === `${machine}.local`)
        return true;
    if (bare.endsWith('.local'))
        return true;
    if (bare.endsWith('.ts.net'))
        return true;
    return false;
}
/** 请求是否来自入口自己的页面。upgrade = WebSocket 握手。 */
export function checkSameOrigin(req, opts = {}) {
    const header = (k) => {
        const v = req.headers[k];
        return Array.isArray(v) ? v[0] : v;
    };
    const host = header('host');
    if (!isAllowedHostName(host, opts.machineName))
        return { ok: false, reason: 'host' };
    const origin = header('origin');
    if (origin !== undefined) {
        let originHost;
        try {
            originHost = new URL(origin).host.toLowerCase();
        }
        catch {
            originHost = undefined;
        }
        if (originHost === undefined || originHost !== host?.toLowerCase())
            return { ok: false, reason: 'origin' };
    }
    const site = header('sec-fetch-site');
    if (site !== undefined && site !== 'same-origin' && site !== 'none') {
        const mode = header('sec-fetch-mode');
        const isNavigation = mode === 'navigate' || mode === 'nested-navigate';
        const isRead = req.method === 'GET' || req.method === 'HEAD';
        if (opts.upgrade || !isNavigation || !isRead)
            return { ok: false, reason: 'cross-site' };
    }
    return { ok: true };
}
