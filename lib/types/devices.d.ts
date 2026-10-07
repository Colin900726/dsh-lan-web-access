/** 「设备」页的数据：允许列表每一条的登录状态、不在列表里却登录着的浏览器、最近被拒的地址。 */
import type { ActiveSession, AccessLogEntry, WhitelistEntry } from './settings.ts';
export interface DeviceSession {
    sid: string;
    ip: string;
    browser: string;
    os: string;
    createdAt: number;
    lastSeenAt: number;
}
export interface DeviceEntry extends WhitelistEntry {
    sessions: DeviceSession[];
    /** 免密模式下这台（这段）设备最近一次来访时间；没来过为 null。 */
    lastSeenAt: number | null;
}
export interface DeniedAddress {
    ip: string;
    count: number;
    lastAt: number;
}
export interface DevicesView {
    entries: DeviceEntry[];
    /** 登录着、但不在允许列表任何一条里的浏览器。 */
    others: DeviceSession[];
    bypassPassword: boolean;
    emptyMode: 'deny-all' | 'private-only';
    recentDenied: DeniedAddress[];
}
/** 最近被拒的地址最多列几个。 */
export declare const RECENT_DENIED_LIMIT = 5;
/** 从 User-Agent 认出浏览器和系统，认不出就写「浏览器」「未知系统」。 */
export declare function describeUserAgent(ua: string): {
    browser: string;
    os: string;
};
/** 最近被拒绝的地址：按最后一次时间倒序，去重，带次数。 */
export declare function recentDenied(log: AccessLogEntry[], limit?: number): DeniedAddress[];
export declare function buildDevicesView(input: {
    whitelist: WhitelistEntry[];
    sessions: ActiveSession[];
    /** 免密模式下按 IP 记的最近来访时间。 */
    lastSeenByIp: Map<string, number>;
    bypassPassword: boolean;
    emptyMode: 'deny-all' | 'private-only';
    log: AccessLogEntry[];
}): DevicesView;
