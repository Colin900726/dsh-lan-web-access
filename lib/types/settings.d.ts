/**
 * 设置的结构、默认值和校验。
 * 存在 `~/.dsh/remote-access.json`（仅本人可读），不放 dsh 的插件配置里：那里一改就会重新加载插件。
 */
/** 设备白名单条目。 */
import { DEFAULT_SESSION_MAX_AGE_DAYS, MIN_PASSWORD_LENGTH, SESSION_MAX_AGE_CHOICES } from './shared.ts';
export interface WhitelistEntry {
    /** 稳定 id（客户端生成）。 */
    id: string;
    /** 备注名，如「客厅 iPad」。 */
    name: string;
    /** IP 或 IPv4 CIDR，如 `192.168.1.20`、`100.64.0.0/10`。 */
    value: string;
}
/** 访问日志条目。 */
export interface AccessLogEntry {
    ts: number;
    kind: 'login' | 'login-failed' | 'whitelist-deny' | 'unauthorized' | 'logout' | 'kick' | 'selfcheck-fail' | 'update' | 'removed' | 'cross-site';
    ip: string;
    detail: string;
    /** 同一设备短时间内重复被拒，合并成一条，这里记次数（没有 = 1）。 */
    count?: number;
}
/** 在线会话（用于「已登录设备」和踢下线）。 */
export interface ActiveSession {
    sid: string;
    username: string;
    ip: string;
    userAgent: string;
    createdAt: number;
    lastSeenAt: number;
}
/** 完整运行时设置。 */
export interface Settings {
    version: number;
    /** 总开关（关掉即恢复 dsh 官方 token 认证）。 */
    enabled: boolean;
    /** 本机免登录（含 SSH 隧道）。 */
    allowLoopback: boolean;
    /** 局域网访问。 */
    lanEnabled: boolean;
    /** 局域网监听地址（空 = 所有网卡）。 */
    lanHost: string;
    /** 局域网监听端口；null = 跟随 dsh 主端口 + 1（Desktop 19388、Web 3081）。 */
    lanPort: number | null;
    /** 第一次有局域网设备连进来后置 true，之后不再显示防火墙提示条。 */
    lanHintDone: boolean;
    /** 设备白名单。 */
    whitelist: WhitelistEntry[];
    /** 白名单为空时的策略：deny-all（拒绝所有）| private-only（仅私网/CGNAT 网段）。 */
    whitelistEmptyMode: 'deny-all' | 'private-only';
    /** 白名单内设备是否免密码。 */
    whitelistBypassPassword: boolean;
    /** 密码散列（scrypt，`salt:hash`）；null = 没设。 */
    passwordHash: string | null;
    /** 管理密码上次设置的时间（毫秒）；未设置为 null。 */
    passwordSetAt: number | null;
    /** 会话有效期（天）。 */
    sessionMaxAgeDays: number;
    /** 会话签名密钥（第一次启动生成）。 */
    sessionSecret: string | null;
    /** 开始记录插件签发 cookie 的时间。早于它签发的 dsh cookie 分不清是谁签的，不认。 */
    mintTrackingSince: number | null;
    /** 插件自己签发过的 cookie 指纹：「本机免登录」关着时不把它们当成 dsh 签发的。 */
    pluginMintedCookies: {
        h: string;
        exp: number;
    }[];
}
export declare const DEFAULT_SETTINGS: Settings;
export { SESSION_MAX_AGE_CHOICES, DEFAULT_SESSION_MAX_AGE_DAYS, MIN_PASSWORD_LENGTH };
export declare function isValidSessionMaxAgeDays(value: unknown): value is number;
/** 端口是否在 1–65535。 */
export declare function isPortInRange(port: unknown): port is number;
/** 局域网入口的默认端口：dsh 主端口 + 1。 */
export declare function defaultLanPort(mainPort: number): number;
/** 局域网入口实际用的端口：没设过或和主端口冲突时，用默认端口。 */
export declare function effectiveLanPort(settings: Pick<Settings, 'lanPort'>, mainPort: number): number;
/** 局域网端口是否可用：在范围内，且不等于 dsh 主端口。 */
export declare function isValidPort(port: unknown, mainPort: number): boolean;
/** 最多记多少条插件签发的 cookie 指纹（过期的会先清掉）。 */
export declare const MAX_MINTED = 1000;
type MintState = Pick<Settings, 'pluginMintedCookies' | 'mintTrackingSince'>;
/**
 * 整理插件签发记录：去掉过期的、签发早于「开始记录的时间」的（这些本来就一律不认，留着没用），
 * 超过上限就挤掉最旧的，并把「开始记录的时间」挪到被挤掉的那些签发时间之后，
 * 它们从此一律不认——宁可多拒（Desktop 重启一次就好），不能错放。
 */
export declare function trimMintRecords(list: {
    h: string;
    exp: number;
}[], since: number, now: number, max?: number): MintState;
/** 记下插件新签发的一张 cookie（见 trimMintRecords）。 */
export declare function addMintRecord(s: MintState, record: {
    h: string;
    exp: number;
}, now: number, max?: number): MintState;
/** 读进来的设置：缺的、不合法的字段用默认值。 */
export declare function normalizeSettings(raw: unknown): Settings;
