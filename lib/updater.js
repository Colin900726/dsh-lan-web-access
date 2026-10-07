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
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareVersions } from "./selfcheck.js";
export const PACKAGE_NAME = 'dsh-lan-web-access';
/** 查版本超时（R-007 异常处理：8 秒）。 */
export const CHECK_TIMEOUT_MS = 8000;
export const NPM_REGISTRY = 'https://registry.npmjs.org';
export const MIRROR_REGISTRY = 'https://registry.npmmirror.com';
export const GITHUB_REPO = 'Colin900726/dsh-lan-web-access';
function versionUrls() {
    const fake = process.env.DSH_REMOTE_ACCESS_REGISTRY;
    if (fake)
        return [fake];
    const path = `/${encodeURIComponent(PACKAGE_NAME)}/latest`;
    return [NPM_REGISTRY + path, MIRROR_REGISTRY + path];
}
async function fetchVersion(url, signal) {
    try {
        const res = await fetch(url, { signal });
        if (!res.ok)
            return undefined;
        const data = (await res.json());
        return typeof data.version === 'string' ? data.version : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * 查最新版本（几个源同时问，取最高的）：有新版本 → available；一样或更旧 → latest；
 * 都查不到（没发布、超时、断网）→ unavailable。
 */
export async function checkLatestVersion(current) {
    const signal = AbortSignal.timeout(CHECK_TIMEOUT_MS);
    const found = (await Promise.all(versionUrls().map((u) => fetchVersion(u, signal)))).filter((v) => v !== undefined);
    if (found.length === 0)
        return { state: 'unavailable', current };
    const newest = found.reduce((a, b) => (compareVersions(b, a) > 0 ? b : a));
    return compareVersions(newest, current) > 0
        ? { state: 'available', current, latest: newest }
        : { state: 'latest', current, latest: current };
}
/** Desktop（Electron 主进程）里用于自举 CLI 的 app.asar 路径。 */
function desktopCliPath(resourcesPath) {
    return join(resourcesPath, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
}
/** 让用户在终端手动运行的更新命令（更新命令找不到时显示）。 */
export function manualUpdateCommand(profile, version) {
    return `dsh plugin --profile ${profile} add ${PACKAGE_NAME}@${version}`;
}
const SAFE_PROFILE = /^[A-Za-z0-9_-]+$/;
/** 版本号会拼进命令行（Windows 经 shell）：只认 x.y.z 和可选的预发布后缀。 */
const SAFE_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
export const UPDATE_SOURCES = ['npm', 'mirror', 'github'];
/** 某个来源下 `dsh plugin add` 的参数（不含 `plugin --profile <p> add`）。 */
function addArgs(version, source) {
    if (source === 'github')
        return [`github:${GITHUB_REPO}#v${version}`];
    const spec = `${PACKAGE_NAME}@${version}`;
    return source === 'mirror' ? [spec, `--registry=${MIRROR_REGISTRY}`] : [spec];
}
export function resolveUpdateCommand(profile, version, platform = process.platform, resourcesPath = process.resourcesPath, source = 'npm') {
    const fake = process.env.DSH_REMOTE_ACCESS_UPDATE_CMD;
    if (fake)
        return { cmd: fake, args: [], shell: true };
    if (!SAFE_VERSION.test(version))
        return undefined;
    const args = ['plugin', '--profile', profile, 'add', ...addArgs(version, source)];
    if (profile === 'desktop' && resourcesPath !== undefined) {
        return {
            cmd: process.execPath,
            args: ['--expose-internals', desktopCliPath(resourcesPath), ...args],
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        };
    }
    // Windows 上 npm 装的命令是 dsh.cmd，批处理文件必须经 shell 启动（Node 直接 spawn .cmd 会报 EINVAL）。
    // 经 shell 时参数会被 shell 解释：profile 名来自 dsh，不受我们控制，只认字母、数字、短横线、下划线，
    // 别的字符（& | > 之类）不拼进命令行，按「找不到命令」处理，界面上给手动更新命令。
    if (platform === 'win32') {
        if (!SAFE_PROFILE.test(profile))
            return undefined;
        return { cmd: 'dsh.cmd', args, shell: true };
    }
    return { cmd: 'dsh', args };
}
const NETWORK_ERROR = /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network/i;
/** 磁盘上本插件 package.json 的版本号（更新后核对用；读不到返回 undefined）。 */
export function installedVersion() {
    try {
        const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : undefined;
    }
    catch {
        return undefined;
    }
}
/** 跑一次命令：退出码（启动失败为 undefined）、输出、启动错误。 */
function runOnce(command, timeoutMs) {
    return new Promise((resolve) => {
        const { cmd, args, env, shell } = command;
        let output = '';
        let settled = false;
        const finish = (r) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(r);
        };
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env, shell });
        const timer = setTimeout(() => {
            child.kill();
            finish({ code: null, output: `${output}\n[timeout]` });
        }, timeoutMs);
        child.stdout.on('data', (d) => (output += d.toString()));
        child.stderr.on('data', (d) => (output += d.toString()));
        child.on('error', (error) => finish({ code: undefined, output: error.message, error }));
        child.on('close', (code) => finish({ code, output }));
    });
}
const SOURCE_LABEL = {
    npm: 'npm 官方源',
    mirror: '国内镜像 npmmirror',
    github: 'GitHub',
};
/**
 * 运行更新，装上 `version` 这个确切版本。依次试 npm 官方源 → 国内镜像 → GitHub，
 * 某个来源命令成功且磁盘上的版本号对上了就停；都不行才报失败。超时、失败都只回报，不动设置。
 */
export async function runUpdate(profile, version, options = {}) {
    const { timeoutMs = 120_000, verify = process.env.DSH_REMOTE_ACCESS_UPDATE_CMD === undefined, readInstalled = installedVersion, sources = process.env.DSH_REMOTE_ACCESS_UPDATE_CMD === undefined ? UPDATE_SOURCES : ['npm'], } = options;
    let log = '';
    let networkOnly = true;
    for (const source of sources) {
        const command = resolveUpdateCommand(profile, version, undefined, undefined, source);
        if (command === undefined)
            return {
                ok: false,
                reason: 'no-command',
                output: `profile 名或版本号不能拼进命令行：${profile} ${version}`,
            };
        const r = await runOnce(command, timeoutMs);
        log += `\n[${SOURCE_LABEL[source]}]\n${r.output}`;
        // 命令本身找不到：换来源也没用。shell 里找不到命令退出码是 127（Windows cmd 是 9009）。
        if (r.error?.code === 'ENOENT' || r.code === 127 || r.code === 9009)
            return { ok: false, reason: 'no-command', output: log };
        if (r.code === 0) {
            // 命令成功不等于装上了新版本（见文件头）：核对磁盘上的版本号。
            const got = verify ? readInstalled() : version;
            if (got === version)
                return { ok: true, output: log };
            log += `\n更新命令已完成，但装上的版本是 ${got ?? '未知'}，不是 ${version}`;
            networkOnly = false;
            continue;
        }
        if (!NETWORK_ERROR.test(r.output))
            networkOnly = false;
    }
    return { ok: false, reason: networkOnly ? 'network' : 'failed', output: log };
}
/** 本插件装在 `<profile>/node_modules/dsh-lan-web-access/`：profile 里 pnpm 的设置文件。 */
function profileWorkspaceFile() {
    return new URL('../../../pnpm-workspace.yaml', import.meta.url);
}
/** 名单里本插件带版本号的条目（pnpm 每装一个确切新版本自动加一条）。 */
const VERSIONED_ENTRY = /^\s*-\s*['"]?dsh-lan-web-access@[^'"\s]+['"]?\s*$/;
/** 名单里本插件不带版本号的条目：对本插件的所有版本放行。 */
const NAME_ENTRY = /^\s*-\s*['"]?dsh-lan-web-access['"]?\s*$/;
const LIST_KEY = /^minimumReleaseAgeExclude:[ \t]*$/;
/**
 * 让「只填包名安装」总是装最新版：把 pnpm「新版本冷静期放行名单」（profile 的 pnpm-workspace.yaml 里的
 * `minimumReleaseAgeExclude`）中本插件的条目换成一条不带版本号的 `dsh-lan-web-access`。
 *
 * 用户 2026-10-07：「用户更新或安装，默认应该都是安装最新的，除非用户有需求，指定版本号」。
 * dsh 内置的 pnpm 11.7 默认不装发布不到一天的版本，每装一个确切新版本就往名单末尾加一条带版本号的，
 * 而名单里本包有多条时只认第一条：名单是「0.1.4、0.1.5」时删掉插件再只填包名重装，装上的是 0.1.4
 * （2026-10-07 Mac / Windows 真机踩到，逐项对比确认）。换成不带版本号的一条后，只填包名装的就是最新版。
 * 代价：对本插件不再有「新版本先等一天」的保护 —— 一键更新本来就装最新版，这层保护对本插件不起作用。
 * 只改本插件的条目，别的包不动；名单是单行写法（`[a, b]`）时不动；文件不存在、读写失败都当没事。
 * 插件启动时、一键更新成功后各调用一次。
 * @returns 有没有改动文件
 */
export function allowLatestInstall(file = profileWorkspaceFile()) {
    let text;
    try {
        text = readFileSync(file, 'utf8');
    }
    catch {
        return false;
    }
    if (/^minimumReleaseAgeExclude:[ \t]*\S/m.test(text))
        return false;
    const lines = text.split('\n').filter((l) => !VERSIONED_ENTRY.test(l) && !NAME_ENTRY.test(l));
    const at = lines.findIndex((l) => LIST_KEY.test(l));
    if (at === -1) {
        while (lines.length > 0 && lines[lines.length - 1] === '')
            lines.pop();
        lines.push('minimumReleaseAgeExclude:', '  - dsh-lan-web-access', '');
    }
    else {
        const indent = /^(\s*)-/.exec(lines[at + 1] ?? '')?.[1] ?? '  ';
        lines.splice(at + 1, 0, `${indent}- dsh-lan-web-access`);
    }
    const next = lines.join('\n');
    if (next === text)
        return false;
    try {
        writeFileSync(file, next);
        return true;
    }
    catch {
        return false;
    }
}
