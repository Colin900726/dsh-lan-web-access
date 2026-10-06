/**
 * 装 dsh 那台电脑的名字（登录页写「{电脑名} 上的 dsh」）。
 * macOS 取「系统设置 → 通用 → 关于本机 → 名称」（scutil --get ComputerName）；
 * Windows 取计算机名；其他系统用主机名并去掉 .local。取不到返回空串，由页面写「这台电脑」。
 */
export declare function computerName(): string;
/** 按系统取电脑名（参数可替换，便于在 macOS 上测 Windows 的分支）。 */
export declare function resolveComputerName(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, readMacName?: () => string, host?: string): string;
