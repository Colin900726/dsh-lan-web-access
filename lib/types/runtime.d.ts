/** 各模块共用的运行时对象。 */
import type { Context } from '@deepseek-ai/cordis';
import type { WebServer } from '@deepseek-ai/dsh-host-webserver';
import type { SettingsStore } from './settings-store.ts';
import type { SessionManager } from './session-store.ts';
import type { RateLimiter } from './ratelimit.ts';
import type { CredentialsLike } from './native-cookie.ts';
import type { AccessLog } from './access-log.ts';
import type { CheckResult, LanState, UpdateState } from './shared.ts';
export interface Runtime {
    ctx: Context;
    webServer: WebServer;
    settingsStore: SettingsStore;
    sessions: SessionManager;
    rateLimiter: RateLimiter;
    getCredentials: () => CredentialsLike | undefined;
    log: AccessLog;
    /** 当前运行环境：desktop | web | unknown。 */
    profile: string;
    /** 本插件版本。 */
    version: string;
    /** 按当前设置开 / 关 / 重开局域网入口，返回没起来的原因。 */
    syncLan: () => Promise<LanState['error']>;
    /** 局域网入口当前的情况（给状态接口）。 */
    lanState: () => LanState;
    /** 局域网设备最近来访时间（按 IP）。 */
    lastSeenByIp: Map<string, number>;
    /** 最近一次运行检查的结果；还没跑完为空数组。 */
    checks: CheckResult[];
    checkedAt: number | null;
    /** 重新跑一遍运行检查，按结果进入或解除安全退出。 */
    recheck: () => Promise<CheckResult[]>;
    /** 前四项有没通过的 → 已安全退出。 */
    fault: () => boolean;
    /** 一键更新的当前状态。 */
    update: UpdateState;
    /** 局域网入口转发时带的令牌（每次启动随机生成）。 */
    gatewayToken: string;
    /** 记下插件自己签发的 cookie 指纹（见 guard.ts）。 */
    recordLockedMint: (fingerprint: string, expiresAt: number) => void;
}
