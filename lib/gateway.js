/**
 * 局域网入口：单独监听一个端口，查过允许列表和登录后，把请求转发给本机的 dsh（含 WebSocket）。
 *
 * 这是局域网设备唯一的入口，所有检查必须在转发之前做完：转发过去就等于本机身份。
 * 插件自己的管理接口不转发。
 */
import { createServer, request as httpRequest, } from 'node:http';
import { isPrivateIp, ipInCidr, normalizeIp } from "./trust.js";
import { checkSameOrigin } from "./origin-guard.js";
import { ERROR_CODES } from "./shared.js";
import { loadSigningSecret, issueNativeCookie, isDocumentNavigation, NATIVE_COOKIE_PREFIX, } from "./native-cookie.js";
import { readSessionToken, sessionCookieClear } from "./cookies.js";
import { handleLoginPost, loginPageHtml, loginView, sendHtml } from "./login.js";
import { computerName } from "./machine-name.js";
import { GATEWAY_HEADER, jsonResponse, clientIp, buildStatus } from "./admin-api.js";
export function whitelistAllows(ip, settings) {
    const normalized = normalizeIp(ip) ?? '';
    if (normalized === '')
        return false;
    if (settings.whitelist.length > 0) {
        return settings.whitelist.some((e) => ipInCidr(normalized, e.value));
    }
    if (settings.whitelistEmptyMode === 'private-only')
        return isPrivateIp(normalized);
    return false;
}
export function createGateway(rt) {
    const { settingsStore, sessions, getCredentials, log } = rt;
    const targetPort = () => rt.webServer.port;
    const loopbackAuthority = () => `127.0.0.1:${targetPort()}`;
    let server;
    let listening = false;
    let boundHost = '';
    let boundPort = 0;
    /** 所有连进来的连接（含升级后的 WebSocket），关入口时逐个断开。 */
    const sockets = new Set();
    /** 升级成 WebSocket 的连接属于谁：哪个 IP、哪个登录（免密进来的没有 sid）。 */
    const upgraded = new Map();
    function sessionOf(req) {
        return sessions.validate(readSessionToken(req) ?? '')?.sid;
    }
    /** 来源不对（别的网站借浏览器发的、或地址栏是可疑域名）：拒绝并记一笔。 */
    function rejectCrossSite(ip, path, reason) {
        log.record('cross-site', ip, `${reason}：${path}`);
    }
    /** 第一台设备连进来（过了白名单）后记下来，设置页就不再显示防火墙提示条。 */
    function markFirstContact() {
        if (settingsStore.get().lanHintDone)
            return;
        // 写设置失败不影响请求，只是提示条多显示一会儿。
        try {
            settingsStore.update({ lanHintDone: true });
        }
        catch (error) {
            rt.ctx?.logger?.warn('remote-access: could not save lanHintDone: %s', error instanceof Error ? error.message : String(error));
        }
    }
    /**
     * 转发给 dsh 用的本机 cookie：每次现签，只放在转发请求的头里，响应里的 dsh cookie 都会被过滤掉，
     * 设备拿不到，所以不记进插件签发记录（每个请求都记会把记录很快挤满）。
     */
    async function mintLoopbackCookie() {
        const secret = await loadSigningSecret(getCredentials());
        if (secret === undefined)
            return undefined;
        return issueNativeCookie(secret, loopbackAuthority());
    }
    function hasSession(req) {
        return sessions.validate(readSessionToken(req) ?? '') !== undefined;
    }
    /** 逐跳头：只对当前连接有意义，代理转发时必须丢弃。 */
    const HOP_BY_HOP = new Set([
        'connection',
        'keep-alive',
        'proxy-connection',
        'proxy-authorization',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade',
    ]);
    /** 转发用的请求头：改成本机地址，带上入口令牌和 dsh 的 cookie。 */
    function forwardHeaders(req, nativeCookie, opts = {}) {
        const headers = {};
        for (const [k, v] of Object.entries(req.headers)) {
            if (v === undefined)
                continue;
            if (HOP_BY_HOP.has(k.toLowerCase()))
                continue;
            if (Array.isArray(v))
                headers[k] = v.join(', ');
            else
                headers[k] = v;
        }
        headers.host = loopbackAuthority();
        // 带上令牌，主服务凭它知道入口已经查过了。
        headers[GATEWAY_HEADER] = rt.gatewayToken;
        // Origin 要和改过的 Host 一致，否则会被拒。
        if (headers.origin !== undefined)
            headers.origin = `http://${loopbackAuthority()}`;
        delete headers['x-forwarded-for'];
        delete headers['x-forwarded-host'];
        delete headers['x-forwarded-proto'];
        if (opts.upgrade) {
            // WebSocket 需要 Connection/Upgrade，补回来。
            headers.connection = 'Upgrade';
            const upgrade = req.headers.upgrade;
            if (typeof upgrade === 'string')
                headers.upgrade = upgrade;
        }
        if (nativeCookie !== undefined) {
            // 只附 `name=value`，不带 Set-Cookie 的属性段。
            // 设备自己带来的 dsh cookie 先去掉，免得 dsh 读到的是它而不是这一张。
            const pair = nativeCookie.slice(0, nativeCookie.indexOf(';'));
            const existing = (headers.cookie ?? '')
                .split(';')
                .map((c) => c.trim())
                .filter((c) => c !== '' && !c.startsWith(NATIVE_COOKIE_PREFIX));
            headers.cookie = [...existing, pair].join('; ');
        }
        return headers;
    }
    function handleRequest(req, res) {
        const ip = clientIp(req);
        const settings = settingsStore.get();
        // 先把路径规范化，免得换个写法（`/./`、`%2e`）绕过下面的判断。
        let path;
        try {
            path = new URL(req.url ?? '/', 'http://x').pathname;
        }
        catch {
            path = '/';
        }
        // 允许列表。
        const allowed = whitelistAllows(ip, settings);
        if (!allowed) {
            log.record('whitelist-deny', ip, path);
            // 浏览器打开页面：给「这台设备还没被允许」页，写出它的 IP 和添加方法；接口请求回 JSON。
            if ((req.method === 'GET' || req.method === 'HEAD') && isDocumentNavigation(req))
                sendHtml(res, 403, loginPageHtml({ state: 'deny', host: computerName(), ip: normalizeIp(ip) ?? ip }));
            else
                jsonResponse(res, 403, { error: '设备不在允许列表里', code: 'not-allowed' });
            return;
        }
        markFirstContact();
        rt.lastSeenByIp.set(normalizeIp(ip) ?? ip, Date.now());
        const origin = checkSameOrigin(req);
        if (!origin.ok) {
            rejectCrossSite(ip, path, origin.reason);
            jsonResponse(res, 403, { error: '请求来源不对', code: ERROR_CODES.crossSite });
            return;
        }
        // 登录、退出、状态由入口自己处理。
        if (path === '/login') {
            sendHtml(res, 200, loginPageHtml(loginView(rt, ip, false)));
            return;
        }
        if (path === '/api/remote-access/status') {
            jsonResponse(res, 200, buildStatus(rt, {
                local: false,
                trusted: false,
                authenticated: hasSession(req),
                port: targetPort(),
                clientIp: normalizeIp(ip) ?? ip,
                withLanIps: false,
            }));
            return;
        }
        if (path === '/api/remote-access/login') {
            handleLoginPost(rt, req, res, { ip, exempt: false }).catch(() => {
                if (!res.headersSent)
                    jsonResponse(res, 500, { error: 'login failed' });
            });
            return;
        }
        if (path === '/api/remote-access/logout') {
            const token = readSessionToken(req);
            if (token) {
                const payload = sessions.validate(token);
                if (payload) {
                    sessions.kick(payload.sid);
                    log.record('logout', ip, '退出登录');
                }
            }
            jsonResponse(res, 200, { ok: true }, { 'set-cookie': [sessionCookieClear()] });
            return;
        }
        // 插件的其他管理接口只给本机用，这里直接拒绝。
        if (path.startsWith('/api/remote-access/')) {
            jsonResponse(res, 403, { error: '仅限本机操作', code: ERROR_CODES.localOnly });
            return;
        }
        // 登录检查（列表内免密的设备除外）。
        if (!settings.whitelistBypassPassword && !hasSession(req)) {
            if (req.method === 'GET' || req.method === 'HEAD') {
                res.writeHead(302, { location: '/login', 'cache-control': 'no-store' });
                res.end();
                return;
            }
            log.record('unauthorized', ip, path);
            jsonResponse(res, 401, { error: 'unauthorized' });
            return;
        }
        // 转发给 dsh。
        void mintLoopbackCookie().then((nativeCookie) => {
            if (nativeCookie === undefined) {
                // dsh 还没准备好（启动中、签名读不到）：页面给「dsh 还没准备好」，接口回 JSON。
                if ((req.method === 'GET' || req.method === 'HEAD') && isDocumentNavigation(req))
                    sendHtml(res, 503, loginPageHtml({ state: 'busy', host: computerName() }));
                else
                    jsonResponse(res, 503, { error: '服务启动中，请稍后重试', code: 'not-ready' });
                return;
            }
            const headers = forwardHeaders(req, nativeCookie);
            const proxyReq = httpRequest({
                host: '127.0.0.1',
                port: targetPort(),
                method: req.method,
                path: req.url,
                headers,
            }, (proxyRes) => {
                const respHeaders = {};
                for (const [k, v] of Object.entries(proxyRes.headers)) {
                    if (v === undefined)
                        continue;
                    if (HOP_BY_HOP.has(k.toLowerCase()))
                        continue;
                    if (k.toLowerCase() === 'set-cookie') {
                        // dsh 的 cookie 不发给局域网设备，免得被踢后还留着一张。
                        const kept = (Array.isArray(v) ? v : [v]).filter((c) => !c.trim().startsWith(NATIVE_COOKIE_PREFIX));
                        if (kept.length > 0)
                            respHeaders[k] = kept;
                        continue;
                    }
                    respHeaders[k] = v;
                }
                res.writeHead(proxyRes.statusCode ?? 502, respHeaders);
                proxyRes.pipe(res);
            });
            proxyReq.on('error', () => {
                if (!res.headersSent)
                    jsonResponse(res, 502, { error: 'bad gateway' });
                else
                    res.destroy();
            });
            req.on('error', () => proxyReq.destroy());
            // 设备那头断了，通往 dsh 的这头也断掉。
            res.on('close', () => proxyReq.destroy());
            req.pipe(proxyReq);
        }, () => {
            if (!res.headersSent)
                jsonResponse(res, 502, { error: 'bad gateway' });
            else
                res.destroy();
        });
    }
    function handleUpgrade(req, socket, head) {
        const ip = clientIp(req);
        const settings = settingsStore.get();
        if (!whitelistAllows(ip, settings)) {
            log.record('whitelist-deny', ip, 'upgrade');
            socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
            return;
        }
        const origin = checkSameOrigin(req, { upgrade: true });
        if (!origin.ok) {
            rejectCrossSite(ip, 'upgrade', origin.reason);
            socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
            return;
        }
        const sid = sessionOf(req);
        if (!settings.whitelistBypassPassword && sid === undefined) {
            socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
            return;
        }
        rt.lastSeenByIp.set(normalizeIp(ip) ?? ip, Date.now());
        upgraded.set(socket, { ip: normalizeIp(ip) ?? ip, sid });
        socket.once('close', () => upgraded.delete(socket));
        void mintLoopbackCookie().then((nativeCookie) => {
            // 等 cookie 的时候连接可能已经被踢了。
            if (socket.destroyed)
                return;
            if (nativeCookie === undefined) {
                socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
                return;
            }
            const headers = forwardHeaders(req, nativeCookie, { upgrade: true });
            const proxyReq = httpRequest({
                host: '127.0.0.1',
                port: targetPort(),
                method: req.method,
                path: req.url,
                headers,
            });
            proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
                // 回 101，然后两头对接。
                const lines = ['HTTP/1.1 101 Switching Protocols'];
                for (const [k, v] of Object.entries(proxyRes.headers)) {
                    if (v === undefined)
                        continue;
                    // dsh 的 cookie 不发给局域网设备（同普通请求）。
                    if (k.toLowerCase() === 'set-cookie') {
                        for (const c of Array.isArray(v) ? v : [v])
                            if (!c.trim().startsWith(NATIVE_COOKIE_PREFIX))
                                lines.push(`${k}: ${c}`);
                        continue;
                    }
                    lines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
                }
                socket.write(`${lines.join('\r\n')}\r\n\r\n`);
                if (proxyHead && proxyHead.length)
                    socket.write(proxyHead);
                // 一头断了，另一头也断开。
                socket.on('close', () => proxySocket.destroy());
                proxySocket.on('close', () => socket.destroy());
                socket.on('error', () => proxySocket.destroy());
                proxySocket.on('error', () => socket.destroy());
                proxySocket.pipe(socket);
                socket.pipe(proxySocket);
            });
            // dsh 没同意升级：关掉，不让客户端干等。
            proxyReq.on('response', () => socket.destroy());
            proxyReq.on('error', () => socket.destroy());
            socket.once('close', () => proxyReq.destroy());
            proxyReq.end(head);
        }, () => socket.destroy());
    }
    return {
        enforce(revokedSids = []) {
            const settings = settingsStore.get();
            const revoked = new Set(revokedSids);
            for (const [socket, owner] of upgraded) {
                const drop = (owner.sid !== undefined && revoked.has(owner.sid)) ||
                    !whitelistAllows(owner.ip, settings) ||
                    (owner.sid === undefined && !settings.whitelistBypassPassword) ||
                    (owner.sid !== undefined && !sessions.has(owner.sid));
                if (drop) {
                    socket.destroy();
                    upgraded.delete(socket);
                }
            }
        },
        get listening() {
            return listening;
        },
        get address() {
            if (!listening || server === undefined)
                return null;
            const a = server.address();
            if (a === null || typeof a === 'string')
                return null;
            return `${a.address}:${a.port}`;
        },
        async start(hostSetting, port) {
            const host = hostSetting || '0.0.0.0';
            if (server !== undefined && boundHost === host && boundPort === port)
                return;
            if (server !== undefined)
                await this.stop();
            const s = createServer(handleRequest);
            s.on('upgrade', handleUpgrade);
            s.on('connection', (socket) => {
                sockets.add(socket);
                socket.on('close', () => sockets.delete(socket));
            });
            try {
                await new Promise((resolve, reject) => {
                    s.once('error', reject);
                    s.listen(port, host, () => resolve());
                });
            }
            catch (error) {
                // 监听失败（如端口被占）：不记成已启动，下次还能重试。
                s.close();
                throw error;
            }
            server = s;
            boundHost = host;
            boundPort = port;
            listening = true;
        },
        async stop() {
            if (server === undefined)
                return;
            const s = server;
            server = undefined;
            listening = false;
            const closed = new Promise((resolve) => s.close(() => resolve()));
            // close() 只是不接新连接，已连着的要逐个断开。
            for (const socket of sockets)
                socket.destroy();
            sockets.clear();
            await closed;
        },
    };
}
