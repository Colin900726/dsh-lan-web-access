/**
 * 设置的结构、默认值和校验。
 * 存在 `~/.dsh/remote-access.json`（仅本人可读），不放 dsh 的插件配置里：那里一改就会重新加载插件。
 */
/** 设备白名单条目。 */
import { SESSION_MAX_AGE_CHOICES } from "./shared.js";
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
    localLoginRequiredSince: null,
    lockedMintedCookies: [],
    sessionMaxAgeDays: 14,
    sessionSecret: null,
};
export { SESSION_MAX_AGE_CHOICES };
export const DEFAULT_SESSION_MAX_AGE_DAYS = 14;
export const MIN_PASSWORD_LENGTH = 12;
export function isValidSessionMaxAgeDays(value) {
    return (typeof value === 'number' &&
        Number.isInteger(value) &&
        SESSION_MAX_AGE_CHOICES.includes(value));
}
/** 端口是否在 1–65535。 */
export function isPortInRange(port) {
    return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}
/** 局域网入口实际用的端口：没设过或和主端口冲突时，用主端口 + 1。 */
export function effectiveLanPort(settings, mainPort) {
    const port = settings.lanPort ?? mainPort + 1;
    return port === mainPort ? mainPort + 1 : port;
}
/** 局域网端口是否可用：在范围内，且不等于 dsh 主端口。 */
export function isValidPort(port, mainPort) {
    return isPortInRange(port) && port !== mainPort;
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
        localLoginRequiredSince: typeof src.localLoginRequiredSince === 'number' ? src.localLoginRequiredSince : null,
        lockedMintedCookies: Array.isArray(src.lockedMintedCookies)
            ? src.lockedMintedCookies.filter((x) => typeof x === 'object' &&
                x !== null &&
                typeof x.h === 'string' &&
                typeof x.exp === 'number')
            : [],
    };
}
