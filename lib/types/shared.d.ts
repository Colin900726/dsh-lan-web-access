/**
 * 前后端共用的常量与类型。界面部分（src/client）也引用它，所以这里不能 import 任何 node 模块。
 * 后端只返回错误码，界面上的话由前端文案表（src/client/strings.ts）按码给出。
 */
/** 运行环境：桌面版 / 网页版（按 dsh profile 名判断）。 */
export type Edition = 'desktop' | 'web' | 'unknown';
/** 管理接口返回给前端的错误码。 */
export declare const ERROR_CODES: {
    /** 需要先设管理密码（关本机免登录、开局域网）。 */
    readonly passwordRequired: "password-required";
    /** 只能在本机做的操作，从局域网发来的。 */
    readonly localOnly: "local-only";
    /** 请求体不是合法 JSON。 */
    readonly invalidBody: "invalid-body";
    /** 端口不在 1–65535，或和 dsh 主端口相同。 */
    readonly invalidPort: "invalid-port";
    /** 其他设置值不合法（白名单条目、登录保持天数、网卡）。 */
    readonly invalidSetting: "invalid-setting";
    /** 局域网入口的端口被别的程序占用了。 */
    readonly portInUse: "port-in-use";
    /** 选中的网卡地址现在不在这台电脑上（断网、组网软件退出）。 */
    readonly hostUnavailable: "host-unavailable";
    /** 允许列表里已经有这个地址。 */
    readonly duplicate: "duplicate";
    /** 局域网入口拒绝了别的网站借浏览器发来的请求。 */
    readonly crossSite: "cross-site";
    /** 密码不对（带 remaining：还能错几次）。 */
    readonly wrongPassword: "wrong-password";
    /** 错太多次，要等（带 retryAfter：还要等几秒）。 */
    readonly locked: "locked";
    /** 新密码不够 12 位。 */
    readonly tooShort: "too-short";
};
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
/** 局域网入口转发到主服务时带的请求头；值是插件本次启动生成的随机令牌（见 index.ts）。 */
export declare const GATEWAY_HEADER = "x-dsh-remote-gateway";
/** 登录保持可选的天数。 */
export declare const SESSION_MAX_AGE_CHOICES: readonly [1, 7, 14, 30];
/** 插件支持的 dsh 版本：[最低, 不含的上限)，与 package.json peerDependencies 一致；COMPAT_LABEL 是给人看的写法。 */
export declare const COMPAT_MIN = "0.1.7-rc.1";
export declare const COMPAT_BELOW = "0.3.0-0";
export declare const COMPAT_LABEL = "0.1.7 \u2013 0.2.x";
/** IPv4 字符串 → 无符号 32 位整数；非法返回 undefined。 */
export declare function parseIpv4(ip: string): number | undefined;
/** 判断一个字符串是否为合法 IPv6 字面量（精确匹配用）。 */
export declare function isIpv6(ip: string): boolean;
/** 解析 CIDR 为 { base, mask }（32 位，IPv4）。非法返回 undefined。 */
export declare function parseCidr(cidr: string): {
    base: number;
    mask: number;
} | undefined;
/** 一条允许列表的值是什么：单台设备（IPv4 / IPv6）、一个网段（IPv4 CIDR），或不合法。 */
export declare function whitelistValueKind(value: string): 'single' | 'range' | 'invalid';
export declare function isValidWhitelistValue(value: string): boolean;
/** `/api/remote-access/status` 的返回内容（主服务和局域网入口共用这一份）。 */
export interface RemoteAccessStatus {
    enabled: boolean;
    allowLoopback: boolean;
    lanEnabled: boolean;
    /** 是否已设管理密码。 */
    registered: boolean;
    authenticated: boolean;
    /** 连接来自本机且地址栏是本机（不看网关标记、不看跨站）。 */
    trusted: boolean;
    /** 能否改设置：本机、未经局域网入口、非跨站。 */
    local: boolean;
    version: string;
    dshVersion: string | null;
    profile: string;
    edition: Edition;
    /** dsh 实际在用的主端口。 */
    port: number;
    /** 本机网卡（给设置页列访问地址）。局域网入口不返回。 */
    lanIps?: {
        name: string;
        address: string;
    }[];
    /** 已登录的局域网浏览器数。只返回给本机。 */
    loggedIn?: number;
    /** 来访设备的 IP。只返回给非本机。 */
    clientIp?: string;
    /** 局域网入口当前的情况。 */
    lan: LanState;
    /** 管理密码上次设置的时间；没设为 null。 */
    passwordSetAt: number | null;
    /** 登录保持天数（1 / 7 / 14 / 30）。 */
    sessionMaxAgeDays: number;
    /** 装 dsh 那台电脑的名字（只读提示里写「请在 {电脑名} 本机打开」）。 */
    machineName: string;
    /** 最近一次运行检查（启动时跑一次；点「重新检查」再跑）。还没跑完时为空数组。 */
    checks: CheckResult[];
    /** 最近一次检查的时间；还没跑完为 null。 */
    checkedAt: number | null;
    /** 前四项有没通过的 → 已安全退出（免登录停了、局域网入口关了）。 */
    fault: boolean;
    /** 插件更新的情况。只返回给本机。 */
    update?: UpdateState;
}
/** 五项运行检查。 */
export type CheckId = 'webServer' | 'signing' | 'sessionKey' | 'dshVersion' | 'password';
export interface CheckResult {
    id: CheckId;
    /** ok 通过；bad 没通过；warn 版本超出范围；idle 中性（没设密码）。 */
    state: 'ok' | 'bad' | 'warn' | 'idle';
    /** webServer：dsh 主端口。 */
    port?: number;
    /** dshVersion：读到的版本号，读不到为 null。 */
    version?: string | null;
}
/**
 * 一键更新（R-007）的六种状态：
 * checking 正在查 · latest 已是最新 · available 有新版本 · unavailable 暂时查不到（没发布 / 超时，中性）
 * · running 更新中 · done 完成 · failed 失败（reason 说原因）。
 */
export interface UpdateState {
    state: 'idle' | 'checking' | 'latest' | 'available' | 'unavailable' | 'running' | 'done' | 'failed';
    current: string;
    latest?: string;
    reason?: 'network' | 'no-command' | 'failed';
    /** 更新命令找不到时，给用户在终端手动运行的命令。 */
    command?: string;
}
/** 局域网入口：选了哪块网卡、实际端口、是否在监听、为什么没起来。 */
export interface LanState {
    /** 选中的监听地址；'' = 所有网卡。 */
    host: string;
    /** 实际在用（或将要用）的端口。 */
    port: number;
    /** 用户自己设过端口（false = 跟随主端口 + 1）。 */
    portCustom: boolean;
    listening: boolean;
    /** 没起来的原因（错误码），起来了就没有。 */
    error?: 'port-in-use' | 'host-unavailable' | 'start-failed';
    /** 选中的网卡地址现在不在这台电脑上。 */
    hostMissing: boolean;
    /** 防火墙提示条已完成使命（第一台设备连上过）。 */
    hintDone: boolean;
}
