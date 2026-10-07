/** 电脑名：macOS 取「关于本机」里的名称，Windows 取计算机名，其他用主机名。取不到返回空串。 */
export declare function computerName(): string;
/** 按系统取电脑名（参数可替换，方便测试）。 */
export declare function resolveComputerName(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, readMacName?: () => string, host?: string): string;
