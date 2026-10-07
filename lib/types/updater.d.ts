/**
 * 一键更新（R-007）：查最新版本 + 用 `dsh plugin add dsh-lan-web-access@<最新版本>` 装上那个确切版本。
 *
 * 不用 `dsh plugin update`：它就是 pnpm update，只在安装时记下的范围里升级 —— 从 GitHub 带标签装的
 * （`github:…#v0.1.2`）会原样重装旧版，npm 装的记成 `^0.1.3` 也升不到 0.2.0，刚发布的版本还会被
 * pnpm 的「新版本冷静期」挡住，而命令照样成功退出（2026-10-07 Mac Desktop 真机踩到）。装确切版本号
 * 不受这些限制；装完再核对磁盘上的版本号，对不上就报失败，不报「完成」。
 *
 * 来源不锁死一种（用户 2026-10-07：「优先npm，如果链接不通，网络中断等问题，可以用github的方法…
 * 总之不能锁死只一种方式」）：依次试 npm 官方源 → 国内镜像 npmmirror → GitHub 上同版本的标签，
 * 哪个装上了这个版本就停。查最新版本同时问 npm 官方源和国内镜像，取较高的那个。
 * 都查不到（没发布、超时、断网）显示「暂时查不到新版本」，中性，不算错。
 * 演示用两个环境变量（正常使用不设）：
 * - DSH_REMOTE_ACCESS_REGISTRY：版本源地址，返回 `{"version": "x.y.z"}`；
 * - DSH_REMOTE_ACCESS_UPDATE_CMD：代替更新命令运行的命令（交给系统 shell；此时不核对装上的版本）。
 *
 * 更新命令：
 * - Desktop：用 Electron 自举（`process.execPath` + app.asar 里的 cli.js），不依赖终端里装没装 dsh；
 * - 其余（Web）：用 PATH 里的 `dsh`；Windows 上是 `dsh.cmd`，经 shell 启动。
 * Desktop 在 Windows 上的安装目录结构按 Electron 惯例同样是 resources/app.asar，待 Windows 真机确认（Q-014）。
 */
import type { UpdateState } from './shared.ts';
export declare const PACKAGE_NAME = "dsh-lan-web-access";
/** 查版本超时（R-007 异常处理：8 秒）。 */
export declare const CHECK_TIMEOUT_MS = 8000;
export declare const NPM_REGISTRY = "https://registry.npmjs.org";
export declare const MIRROR_REGISTRY = "https://registry.npmmirror.com";
export declare const GITHUB_REPO = "Colin900726/dsh-lan-web-access";
/**
 * 查最新版本（几个源同时问，取最高的）：有新版本 → available；一样或更旧 → latest；
 * 都查不到（没发布、超时、断网）→ unavailable。
 */
export declare function checkLatestVersion(current: string): Promise<UpdateState>;
interface UpdateCommand {
    cmd: string;
    args: string[];
    env?: NodeJS.ProcessEnv;
    shell?: boolean;
}
/** 让用户在终端手动运行的更新命令（更新命令找不到时显示）。 */
export declare function manualUpdateCommand(profile: string, version: string): string;
/** 一键更新依次尝试的安装来源。 */
export type UpdateSource = 'npm' | 'mirror' | 'github';
export declare const UPDATE_SOURCES: readonly UpdateSource[];
export declare function resolveUpdateCommand(profile: string, version: string, platform?: NodeJS.Platform, resourcesPath?: string | undefined, source?: UpdateSource): UpdateCommand | undefined;
export interface UpdateResult {
    ok: boolean;
    reason?: 'network' | 'no-command' | 'failed';
    output: string;
}
/** 磁盘上本插件 package.json 的版本号（更新后核对用；读不到返回 undefined）。 */
export declare function installedVersion(): string | undefined;
/**
 * 运行更新，装上 `version` 这个确切版本。依次试 npm 官方源 → 国内镜像 → GitHub，
 * 某个来源命令成功且磁盘上的版本号对上了就停；都不行才报失败。超时、失败都只回报，不动设置。
 */
export declare function runUpdate(profile: string, version: string, options?: {
    /** 每个来源的超时。 */
    timeoutMs?: number;
    /** 装完核对版本号；默认核对，只有演示变量代替更新命令时不核对。 */
    verify?: boolean;
    readInstalled?: () => string | undefined;
    sources?: readonly UpdateSource[];
}): Promise<UpdateResult>;
/**
 * 清掉 pnpm「新版本冷静期放行名单」（`minimumReleaseAgeExclude`）里本插件的旧版本条目，只留 `keep`。
 *
 * dsh 内置的 pnpm 11.7 只认名单里本包的第一条：名单是「0.1.4、0.1.5」时，删掉插件再只填包名重装，
 * 装上的是 0.1.4 —— 删了重装也回不到新版本（2026-10-07 Mac / Windows 真机踩到，逐项对比确认）。
 * 每装一个确切版本 pnpm 就往名单末尾加一条，旧条目越积越多。只改本插件的条目，别的不动；
 * 文件不存在、读写失败都当没事（返回 false）。
 * @returns 有没有改动文件
 */
export declare function pruneReleaseAgeExclusions(keep: string, file?: URL): boolean;
export {};
