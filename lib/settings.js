/**
 * 设置的结构、默认值和校验。
 * 存在 `~/.dsh/remote-access.json`（仅本人可读），不放 dsh 的插件配置里：那里一改就会重新加载插件。
 */
/** 设备白名单条目。 */
import { DEFAULT_SESSION_MAX_AGE_DAYS, MIN_PASSWORD_LENGTH, NATIVE_COOKIE_MAX_AGE_SEC, SESSION_MAX_AGE_CHOICES, } from "./shared.js";
export const DEFAULT_SETTINGS = {
    version: 1,
    enabled: true,
    allowLoopback: true,
    lanEnabled: false,
    lanHost: '',
    lanPort: null,
    lanHintDone: false,
    whitelist: [],
    whitelistEmptyMode: 'deny-all',
    whitelistBypassPassword: false,
    passwordHash: null,
    passwordSetAt: null,
    mintTrackingSince: null,
    pluginMintedCookies: [],
    sessionMaxAgeDays: DEFAULT_SESSION_MAX_AGE_DAYS,
    sessionSecret: null,
};
export { SESSION_MAX_AGE_CHOICES, DEFAULT_SESSION_MAX_AGE_DAYS, MIN_PASSWORD_LENGTH };
export function isValidSessionMaxAgeDays(value) {
    return (typeof value === 'number' &&
        Number.isInteger(value) &&
        SESSION_MAX_AGE_CHOICES.includes(value));
}
/** 端口是否在 1–65535。 */
export function isPortInRange(port) {
    return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}
/** 局域网入口的默认端口：dsh 主端口 + 1。 */
export function defaultLanPort(mainPort) {
    return mainPort + 1;
}
/** 局域网入口实际用的端口：没设过或和主端口冲突时，用默认端口。 */
export function effectiveLanPort(settings, mainPort) {
    const port = settings.lanPort ?? defaultLanPort(mainPort);
    return port === mainPort ? defaultLanPort(mainPort) : port;
}
/** 局域网端口是否可用：在范围内，且不等于 dsh 主端口。 */
export function isValidPort(port, mainPort) {
    return isPortInRange(port) && port !== mainPort;
}
function mintedList(v) {
    if (!Array.isArray(v))
        return [];
    return v.filter((x) => typeof x === 'object' &&
        x !== null &&
        typeof x.h === 'string' &&
        typeof x.exp === 'number');
}
/** 最多记多少条插件签发的 cookie 指纹（过期的会先清掉）。 */
export const MAX_MINTED = 1000;
/**
 * 记下插件新签发的一张 cookie。记录满了要挤掉最旧的：把「开始记录的时间」挪到被挤掉的那些
 * 签发时间之后，它们从此一律不认——宁可多拒（Desktop 重启一次就好），不能错放。
 */
export function addMintRecord(s, record, now, max = MAX_MINTED) {
    const all = [...s.pluginMintedCookies.filter((x) => x.exp > now), record];
    const dropped = all.slice(0, Math.max(0, all.length - max));
    const since = dropped.reduce((t, x) => Math.max(t, x.exp - NATIVE_COOKIE_MAX_AGE_SEC * 1000 + 1), s.mintTrackingSince ?? now);
    return { pluginMintedCookies: all.slice(-max), mintTrackingSince: since };
}
/** 读进来的设置：缺的、不合法的字段用默认值。 */
export function normalizeSettings(raw) {
    const src = (raw && typeof raw === 'object' ? raw : {});
    const whitelist = Array.isArray(src.whitelist)
        ? src.whitelist
            .filter((e) => !!e && typeof e === 'object')
            .map((e) => ({
            id: typeof e.id === 'string' ? e.id : '',
            name: typeof e.name === 'string' ? e.name : '',
            value: typeof e.value === 'string' ? e.value : '',
        }))
            .filter((e) => e.id !== '' && e.value !== '')
        : [];
    const lanPort = isPortInRange(src.lanPort) ? src.lanPort : null;
    return {
        version: 1,
        enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_SETTINGS.enabled,
        allowLoopback: typeof src.allowLoopback === 'boolean' ? src.allowLoopback : DEFAULT_SETTINGS.allowLoopback,
        lanEnabled: typeof src.lanEnabled === 'boolean' ? src.lanEnabled : DEFAULT_SETTINGS.lanEnabled,
        lanHost: typeof src.lanHost === 'string' ? src.lanHost : DEFAULT_SETTINGS.lanHost,
        lanPort,
        lanHintDone: typeof src.lanHintDone === 'boolean' ? src.lanHintDone : DEFAULT_SETTINGS.lanHintDone,
        whitelist,
        whitelistEmptyMode: src.whitelistEmptyMode === 'private-only' || src.whitelistEmptyMode === 'same-subnet'
            ? 'private-only'
            : 'deny-all',
        whitelistBypassPassword: typeof src.whitelistBypassPassword === 'boolean'
            ? src.whitelistBypassPassword
            : DEFAULT_SETTINGS.whitelistBypassPassword,
        passwordHash: typeof src.passwordHash === 'string' ? src.passwordHash : null,
        passwordSetAt: typeof src.passwordHash === 'string' && typeof src.passwordSetAt === 'number'
            ? src.passwordSetAt
            : null,
        sessionMaxAgeDays: isValidSessionMaxAgeDays(src.sessionMaxAgeDays)
            ? src.sessionMaxAgeDays
            : DEFAULT_SETTINGS.sessionMaxAgeDays,
        sessionSecret: typeof src.sessionSecret === 'string' ? src.sessionSecret : null,
        mintTrackingSince: typeof src.mintTrackingSince === 'number' ? src.mintTrackingSince : null,
        pluginMintedCookies: mintedList(src.pluginMintedCookies),
    };
}
