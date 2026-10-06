/**
 * 可持久化设置模型 + 默认值 + 纯校验。
 *
 * 运行时设置统一存 `$DSH_HOME/remote-access.json`（0600），不写 cordis.patch.yml：
 * patch 是整行替换，且改配置会触发热重载，容易覆盖用户手写内容。
 */
/** 设备白名单条目。 */
import { SESSION_MAX_AGE_CHOICES } from './shared.ts';
export interface WhitelistEntry {
    /** 稳定 id（客户端生成）。 */
    id: string;
    /** 备注名，如「B MacBook Pro」。 */
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
/** 在线会话（服务端表，用于「在线设备」与单设备下线）。 */
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
    /** 启用本插件（关闭即恢复官方 token 认证）。 */
    enabled: boolean;
    /** 本机免登录（含 SSH 隧道）。 */
    allowLoopback: boolean;
    /** 局域网访问。 */
    lanEnabled: boolean;
    /** 局域网监听 IP（空 = 未设置）。 */
    lanHost: string;
    /** 局域网监听端口；null = 跟随 dsh 主端口 + 1（桌面版 19388、网页版 3081）。 */
    lanPort: number | null;
    /** 第一次有局域网设备连进来后置 true，之后不再显示防火墙提示条。 */
    lanHintDone: boolean;
    /** 设备白名单。 */
    whitelist: WhitelistEntry[];
    /** 白名单为空时的策略：deny-all（拒绝所有）| private-only（仅私网/CGNAT 网段）。 */
    whitelistEmptyMode: 'deny-all' | 'private-only';
    /** 白名单内设备是否免密码。 */
    whitelistBypassPassword: boolean;
    /** scrypt 密码散列 `salt:hash`；null = 未设置。 */
    passwordHash: string | null;
    /** 管理密码上次设置的时间（毫秒）；未设置为 null。 */
    passwordSetAt: number | null;
    /** 会话有效期（天）。 */
    sessionMaxAgeDays: number;
    /** 会话 HMAC 签名密钥（首次启动生成）。 */
    sessionSecret: string | null;
}
export declare const DEFAULT_SETTINGS: Settings;
export { SESSION_MAX_AGE_CHOICES };
export declare const DEFAULT_SESSION_MAX_AGE_DAYS = 14;
export declare const MIN_PASSWORD_LENGTH = 12;
export declare function isValidSessionMaxAgeDays(value: unknown): value is number;
/** 端口是否在 1–65535 之间（整数）。 */
export declare function isPortInRange(port: unknown): port is number;
/**
 * 局域网入口实际用的端口：没设过就用 dsh 主端口 + 1；设过的端口如果正好等于主端口
 * （例如从桌面版带过来的设置装到了网页版），也退回主端口 + 1，不和 dsh 抢端口。
 */
export declare function effectiveLanPort(settings: Pick<Settings, 'lanPort'>, mainPort: number): number;
/** 局域网端口是否可用：在范围内，且不等于 dsh 实际在用的主端口（桌面版 19387、网页版默认 3080，以运行时为准）。 */
export declare function isValidPort(port: unknown, mainPort: number): boolean;
/** 规范化未知来源的 settings 对象，缺失/非法字段回落到默认值。 */
export declare function normalizeSettings(raw: unknown): Settings;
