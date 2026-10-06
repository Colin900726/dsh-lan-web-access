/**
 * 一键更新（R-007）：查最新版本 + 触发 `dsh plugin update`。
 *
 * 版本源默认是 npm；发布到 npm 之前（Q-001）查不到，显示「暂时查不到新版本」，中性，不算错。
 * 演示用两个环境变量（正常使用不设）：
 * - DSH_REMOTE_ACCESS_REGISTRY：版本源地址，返回 `{"version": "x.y.z"}`；
 * - DSH_REMOTE_ACCESS_UPDATE_CMD：代替 `dsh plugin update` 运行的命令（交给系统 shell）。
 *
 * 更新命令：
 * - 桌面版：用 Electron 自举（`process.execPath` + app.asar 里的 cli.js），不依赖终端里装没装 dsh；
 * - 其余（网页版）：用 PATH 里的 `dsh`；Windows 上是 `dsh.cmd`，经 shell 启动。
 * 桌面版在 Windows 上的安装目录结构按 Electron 惯例同样是 resources/app.asar，待 Windows 真机确认（Q-014）。
 */
import type { UpdateState } from './shared.ts';
export declare const PACKAGE_NAME = "dsh-lan-web-access";
/** 查版本超时（R-007 异常处理：8 秒）。 */
export declare const CHECK_TIMEOUT_MS = 8000;
/** 查最新版本：有新版本 → available；一样或更旧 → latest；查不到（没发布、超时、断网）→ unavailable。 */
export declare function checkLatestVersion(current: string): Promise<UpdateState>;
interface UpdateCommand {
    cmd: string;
    args: string[];
    env?: NodeJS.ProcessEnv;
    shell?: boolean;
}
/** 让用户在终端手动运行的更新命令（更新命令找不到时显示）。 */
export declare function manualUpdateCommand(profile: string): string;
export declare function resolveUpdateCommand(profile: string, platform?: NodeJS.Platform, resourcesPath?: string | undefined): UpdateCommand | undefined;
export interface UpdateResult {
    ok: boolean;
    reason?: 'network' | 'no-command' | 'failed';
    output: string;
}
/** 运行更新命令。超时、失败都只回报，不动设置。 */
export declare function runUpdate(profile: string, timeoutMs?: number): Promise<UpdateResult>;
export {};
