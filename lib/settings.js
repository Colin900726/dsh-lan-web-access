/**
 * 可持久化设置模型 + 默认值 + 纯校验。
 *
 * 运行时设置统一存 `$DSH_HOME/remote-access.json`（0600），不写 cordis.patch.yml：
 * patch 是整行替换，且改配置会触发热重载，容易覆盖用户手写内容。
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
/** 端口是否在 1–65535 之间（整数）。 */
export function isPortInRange(port) {
    return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}
/**
 * 局域网入口实际用的端口：没设过就用 dsh 主端口 + 1；设过的端口如果正好等于主端口
 * （例如从桌面版带过来的设置装到了网页版），也退回主端口 + 1，不和 dsh 抢端口。
 */
export function effectiveLanPort(settings, mainPort) {
    const port = settings.lanPort ?? mainPort + 1;
    return port === mainPort ? mainPort + 1 : port;
}
/** 局域网端口是否可用：在范围内，且不等于 dsh 实际在用的主端口（桌面版 19387、网页版默认 3080，以运行时为准）。 */
export function isValidPort(port, mainPort) {
    return isPortInRange(port) && port !== mainPort;
}
/** 规范化未知来源的 settings 对象，缺失/非法字段回落到默认值。 */
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
    };
}
