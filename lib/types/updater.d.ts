/**
 * 一键更新：查最新版本，再用 `dsh plugin add dsh-lan-web-access@<版本>` 装这个确切版本。
 *
 * 不用 `dsh plugin update`：它只在安装时记下的范围内升级，常常装回旧版却照样报成功。
 * 安装来源依次试 npm 官方源 → 国内镜像 → GitHub，装完核对版本号，对不上算失败。
 *
 * 更新命令：Desktop 用自带运行时跑 app.asar 里的 cli.js；Web 用 PATH 里的 `dsh`（Windows 是 `dsh.cmd`）。
 * 测试用环境变量：DSH_REMOTE_ACCESS_REGISTRY 换版本源，DSH_REMOTE_ACCESS_UPDATE_CMD 换更新命令。
 */
import type { UpdateState } from './shared.ts';
export declare const PACKAGE_NAME = "dsh-lan-web-access";
/** 查版本超时。 */
export declare const CHECK_TIMEOUT_MS = 8000;
export declare const NPM_REGISTRY = "https://registry.npmjs.org";
export declare const MIRROR_REGISTRY = "https://registry.npmmirror.com";
export declare const GITHUB_REPO = "Colin900726/dsh-lan-web-access";
/** 同时问 npm 官方源和国内镜像，取较高的版本；都查不到算 unavailable。 */
export declare function checkLatestVersion(current: string): Promise<UpdateState>;
interface UpdateCommand {
    cmd: string;
    args: string[];
    env?: NodeJS.ProcessEnv;
    shell?: boolean;
}
/** 自动更新跑不起来时，给用户手动运行的命令。 */
export declare function manualUpdateCommand(profile: string, version: string): string;
/** 依次尝试的安装来源。 */
export type UpdateSource = 'npm' | 'mirror' | 'github';
export declare const UPDATE_SOURCES: readonly UpdateSource[];
export declare function resolveUpdateCommand(profile: string, version: string, platform?: NodeJS.Platform, resourcesPath?: string | undefined, source?: UpdateSource): UpdateCommand | undefined;
export interface UpdateResult {
    ok: boolean;
    reason?: 'network' | 'no-command' | 'bad-arg' | 'failed';
    output: string;
}
/** 磁盘上本插件的版本号，更新后核对用。 */
export declare function installedVersion(): string | undefined;
/** 装上 `version` 这个版本：按来源依次试，装上且版本号对得上就停，都不行报失败。 */
export declare function runUpdate(profile: string, version: string, options?: {
    /** 每个来源的超时。 */
    timeoutMs?: number;
    /** 装完核对版本号（用测试命令时默认不核对）。 */
    verify?: boolean;
    readInstalled?: () => string | undefined;
    sources?: readonly UpdateSource[];
}): Promise<UpdateResult>;
/**
 * 让「只填包名安装」总是装最新版。
 *
 * pnpm 默认不装发布不到一天的版本，每装一个新版本就往 `minimumReleaseAgeExclude` 名单加一条
 * `dsh-lan-web-access@x.y.z`；名单里本包有多条时它只认第一条，删了重装就会装回旧版。
 * 这里把名单里本插件的条目换成一条不带版本号的，对所有版本放行。别的条目、别的键都不动，
 * 缩进照原样；整个文件都是 CRLF 才用 CRLF，否则用 LF。名单是单行写法、或认不出写法时不动。
 * @returns 有没有改动文件
 */
export declare function allowLatestInstall(file?: URL | undefined): boolean;
export {};
