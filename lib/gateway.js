/**
 * 局域网网关（方案 A）：在 `lanHost:lanPort` 监听，白名单 + 密码会话校验通过后，
 * 把请求转发到 `127.0.0.1:<主端口>`，改写 Host 为本机、覆盖注入网关标记与原生
 * cookie，让主服务器把它当「本机请求」。同时转发 WebSocket 升级。
 *
 * 安全边界：网关是局域网路径唯一防线——白名单与会话校验必须在转发之前完成，
 * 任何漏转发都会放进来一个本机身份。敏感管理 API 不经网关转发（主服务器用
 * `x-dsh-remote-gateway` 标记区分，见 admin-api.ts）。
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
        // 写配置文件失败（磁盘满、权限）不能让请求处理抛出去把 dsh 带崩：只是提示条多显示一会儿。
        try {
            settingsStore.update({ lanHintDone: true });
        }
        catch (error) {
            rt.ctx?.logger?.warn('remote-access: could not save lanHintDone: %s', error instanceof Error ? error.message : String(error));
        }
    }
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
    /** 构建转发到主服务器的请求头：改 Host、重写 Origin、丢弃逐跳头、加网关标记、附原生 cookie。 */
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
        // 带上本进程的令牌：主服务凭它认出「入口已经查过允许列表和登录」（免密设备没有登录也能进）。
        headers[GATEWAY_HEADER] = rt.gatewayToken;
        // Origin 需与改写后的 Host 一致，否则主服务器（尤其 WebSocket 握手）可能拒。
        if (headers.origin !== undefined)
            headers.origin = `http://${loopbackAuthority()}`;
        delete headers['x-forwarded-for'];
        delete headers['x-forwarded-host'];
        delete headers['x-forwarded-proto'];
        if (opts.upgrade) {
            // 逐跳头里剔掉的 Connection/Upgrade 对 WebSocket 是必需的，需补回。
            headers.connection = 'Upgrade';
            const upgrade = req.headers.upgrade;
            if (typeof upgrade === 'string')
                headers.upgrade = upgrade;
        }
        if (nativeCookie !== undefined) {
            // 只附 `name=value`，不带 Set-Cookie 的属性段。
            const pair = nativeCookie.slice(0, nativeCookie.indexOf(';'));
            const existing = headers.cookie ?? '';
            headers.cookie = existing ? `${existing}; ${pair}` : pair;
        }
        return headers;
    }
    function handleRequest(req, res) {
        const ip = clientIp(req);
        const settings = settingsStore.get();
        // 先按 URL 规则归一（`/./`、`%2e` 这类写法），和主服务认路径的方式一致，免得换个写法绕过下面的判断。
        let path;
        try {
            path = new URL(req.url ?? '/', 'http://x').pathname;
        }
        catch {
            path = '/';
        }
        // 白名单（局域网路径第一道闸）。
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
        // 登录/退出/状态由网关自行处理（不回源主服务器）。
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
            void handleLoginPost(rt, req, res, { ip, exempt: false });
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
        // 插件自己的其余接口（改设置、密码、设备、更新……）只给本机用，入口这里直接拒绝，不转发。
        if (path.startsWith('/api/remote-access/')) {
            jsonResponse(res, 403, { error: '仅限本机操作', code: ERROR_CODES.localOnly });
            return;
        }
        // 会话校验（白名单免密开关除外）。
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
        // 转发到主服务器。
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
                        // dsh 的原生通行证只在入口和主服务之间用，不发给局域网设备（踢下线后它不该还留着一张）。
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
            // 局域网那一端断了（被踢、入口关闭、设备走开），通往 dsh 的这半条也一起断，不留空挂的流式连接。
            res.on('close', () => proxyReq.destroy());
            req.pipe(proxyReq);
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
            // 等通行证的这一会儿里连接可能已经被踢掉了：不再去连 dsh。
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
                // 回写 101 + 上游协商头给客户端，再双向管道。
                const lines = ['HTTP/1.1 101 Switching Protocols'];
                for (const [k, v] of Object.entries(proxyRes.headers)) {
                    if (v === undefined)
                        continue;
                    lines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
                }
                socket.write(`${lines.join('\r\n')}\r\n\r\n`);
                if (proxyHead && proxyHead.length)
                    socket.write(proxyHead);
                // 任一端断开（含被踢下线时 destroy），另一端也断开；pipe 自己不会关掉另一端。
                socket.on('close', () => proxySocket.destroy());
                proxySocket.on('close', () => socket.destroy());
                socket.on('error', () => proxySocket.destroy());
                proxySocket.on('error', () => socket.destroy());
                proxySocket.pipe(socket);
                socket.pipe(proxySocket);
            });
            // 目标未升级（返回非 101）时：不能让客户端 socket 悬挂，直接关闭。
            proxyReq.on('response', () => socket.destroy());
            proxyReq.on('error', () => socket.destroy());
            socket.once('close', () => proxyReq.destroy());
            proxyReq.end(head);
        });
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
                // 监听失败（如端口被占）时不能把 server 置为已存在，否则后续永远无法重试。
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
            // close() 只是不再接新连接；已连着的（含 WebSocket）要逐个断开，入口才算真的关了。
            for (const socket of sockets)
                socket.destroy();
            sockets.clear();
            await closed;
        },
    };
}
