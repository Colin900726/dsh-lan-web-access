/**
 * 前后端共用的常量与类型。浏览器半（src/client）也引用它，所以这里不能 import 任何 node 模块。
 * 后端只返回错误码，界面上的话由前端文案表（src/client/strings.ts）按码给出。
 */
/** 管理接口返回给前端的错误码。 */
export const ERROR_CODES = {
    /** 需要先设管理密码（关本机免登录、开局域网）。 */
    passwordRequired: 'password-required',
    /** 只能在本机做的操作，从局域网发来的。 */
    localOnly: 'local-only',
    /** 请求体不是合法 JSON。 */
    invalidBody: 'invalid-body',
    /** 端口不在 1–65535，或和 dsh 主端口相同。 */
    invalidPort: 'invalid-port',
    /** 其他设置值不合法（白名单条目、登录保持天数、网卡）。 */
    invalidSetting: 'invalid-setting',
    /** 局域网入口的端口被别的程序占用了。 */
    portInUse: 'port-in-use',
    /** 选中的网卡地址现在不在这台电脑上（断网、组网软件退出）。 */
    hostUnavailable: 'host-unavailable',
    /** 允许列表里已经有这个地址。 */
    duplicate: 'duplicate',
    /** 局域网入口拒绝了别的网站借浏览器发来的请求。 */
    crossSite: 'cross-site',
    /** 密码不对（带 remaining：还能错几次）。 */
    wrongPassword: 'wrong-password',
    /** 错太多次，要等（带 retryAfter：还要等几秒）。 */
    locked: 'locked',
    /** 新密码不够 12 位。 */
    tooShort: 'too-short',
};
/** 局域网入口转发到主服务时带的请求头；值是插件本次启动生成的随机令牌（见 index.ts）。 */
export const GATEWAY_HEADER = 'x-dsh-remote-gateway';
/** 登录保持可选的天数。 */
export const SESSION_MAX_AGE_CHOICES = [1, 7, 14, 30];
/** 插件支持的 dsh 版本：[最低, 不含的上限)，与 package.json peerDependencies 一致；COMPAT_LABEL 是给人看的写法。 */
export const COMPAT_MIN = '0.1.7-rc.1';
export const COMPAT_BELOW = '0.3.0-0';
export const COMPAT_LABEL = '0.1.7 – 0.2.x';
// ── 允许列表的地址校验（前后端共用，不依赖 node 模块）────────────────────────
/** IPv4 字符串 → 无符号 32 位整数；非法返回 undefined。 */
export function parseIpv4(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4)
        return undefined;
    let n = 0;
    for (const p of parts) {
        if (!/^\d{1,3}$/.test(p))
            return undefined;
        const v = Number(p);
        if (v > 255)
            return undefined;
        n = n * 256 + v;
    }
    return n >>> 0;
}
/** 判断一个字符串是否为合法 IPv6 字面量（精确匹配用）。 */
export function isIpv6(ip) {
    if (typeof ip !== 'string' || ip === '')
        return false;
    if (!ip.includes(':'))
        return false;
    try {
        const u = new URL(`http://[${ip}]`);
        return u.hostname.startsWith('[') || u.hostname.includes(':');
    }
    catch {
        return false;
    }
}
/** 解析 CIDR 为 { base, mask }（32 位，IPv4）。非法返回 undefined。 */
export function parseCidr(cidr) {
    const s = cidr.trim();
    const slash = s.indexOf('/');
    let ipPart;
    let bits;
    if (slash === -1) {
        ipPart = s;
        bits = 32;
    }
    else {
        ipPart = s.slice(0, slash);
        const raw = s.slice(slash + 1);
        if (!/^\d{1,2}$/.test(raw))
            return undefined;
        const b = Number(raw);
        if (b > 32)
            return undefined;
        bits = b;
    }
    const base = parseIpv4(ipPart);
    if (base === undefined)
        return undefined;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return { base: (base & mask) >>> 0, mask };
}
/** 一条允许列表的值是什么：单台设备（IPv4 / IPv6）、一个网段（IPv4 CIDR），或不合法。 */
export function whitelistValueKind(value) {
    const s = value.trim();
    if (s === '')
        return 'invalid';
    if (s.includes('/'))
        return parseCidr(s) !== undefined ? 'range' : 'invalid';
    if (s.includes(':'))
        return isIpv6(s) ? 'single' : 'invalid';
    return parseIpv4(s) !== undefined ? 'single' : 'invalid';
}
export function isValidWhitelistValue(value) {
    return whitelistValueKind(value) !== 'invalid';
}
