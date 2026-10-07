/**
 * 一键更新：查最新版本，再用 `dsh plugin add dsh-lan-web-access@<版本>` 装这个确切版本。
 *
 * 不用 `dsh plugin update`：它只在安装时记下的范围内升级，常常装回旧版却照样报成功。
 * 安装来源依次试 npm 官方源 → 国内镜像 → GitHub，装完核对版本号，对不上算失败。
 *
 * 更新命令：Desktop 用自带运行时跑 app.asar 里的 cli.js；Web 用 PATH 里的 `dsh`（Windows 是 `dsh.cmd`）。
 * 测试用环境变量：DSH_REMOTE_ACCESS_REGISTRY 换版本源，DSH_REMOTE_ACCESS_UPDATE_CMD 换更新命令。
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareVersions } from "./selfcheck.js";
export const PACKAGE_NAME = 'dsh-lan-web-access';
/** 查版本超时。 */
export const CHECK_TIMEOUT_MS = 8000;
export const NPM_REGISTRY = 'https://registry.npmjs.org';
export const MIRROR_REGISTRY = 'https://registry.npmmirror.com';
export const GITHUB_REPO = 'Colin900726/dsh-lan-web-access';
function versionUrls() {
    // 测试用：可以给多个，逗号分隔。
    const fake = process.env.DSH_REMOTE_ACCESS_REGISTRY;
    if (fake)
        return fake
            .split(',')
            .map((u) => u.trim())
            .filter(Boolean);
    const path = `/${encodeURIComponent(PACKAGE_NAME)}/latest`;
    return [NPM_REGISTRY + path, MIRROR_REGISTRY + path];
}
async function fetchVersion(url, signal) {
    try {
        const res = await fetch(url, { signal });
        if (!res.ok)
            return undefined;
        const data = (await res.json());
        return typeof data.version === 'string' && SAFE_VERSION.test(data.version)
            ? data.version
            : undefined;
    }
    catch {
        return undefined;
    }
}
/** 同时问 npm 官方源和国内镜像，取较高的版本；都查不到算 unavailable。 */
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
/** Desktop 自带的 dsh 命令行入口。 */
function desktopCliPath(resourcesPath) {
    return join(resourcesPath, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
}
/** 自动更新跑不起来时，给用户手动运行的命令。 */
export function manualUpdateCommand(profile, version) {
    return `dsh plugin --profile ${profile} add ${PACKAGE_NAME}@${version}`;
}
const SAFE_PROFILE = /^[A-Za-z0-9_-]+$/;
/** 版本号要拼进命令行：只认 x.y.z(-预发布)。 */
const SAFE_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
export const UPDATE_SOURCES = ['npm', 'mirror', 'github'];
/** 某个来源下 `dsh plugin add` 后面的参数。 */
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
    // Windows 的 dsh.cmd 必须经 shell 启动，参数会被 shell 解释：profile 名含特殊字符就不拼，改给手动命令。
    if (platform === 'win32') {
        if (!SAFE_PROFILE.test(profile))
            return undefined;
        return { cmd: 'dsh.cmd', args, shell: true };
    }
    return { cmd: 'dsh', args };
}
const NETWORK_ERROR = /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network/i;
/** 磁盘上本插件的版本号，更新后核对用。 */
export function installedVersion() {
    try {
        const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : undefined;
    }
    catch {
        return undefined;
    }
}
/** 杀掉整棵进程树：dsh 会再起 pnpm，只杀直接子进程的话 pnpm 还在写文件。 */
function killTree(pid) {
    if (pid === undefined)
        return;
    try {
        if (process.platform === 'win32')
            spawn('taskkill', ['/T', '/F', '/PID', String(pid)]);
        else
            process.kill(-pid, 'SIGKILL');
    }
    catch {
        // 进程已经退出。
    }
}
/** 跑一次命令，返回退出码和输出。超时就杀掉整棵进程树，等它真的退出了才返回。 */
function runOnce(command, timeoutMs) {
    return new Promise((resolve) => {
        const { cmd, args, env, shell } = command;
        let output = '';
        let settled = false;
        let timedOut = false;
        const finish = (r) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            clearTimeout(giveUp);
            resolve(r);
        };
        // 非 Windows 上单独成组，超时时能连子孙进程一起杀。
        const child = spawn(cmd, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env,
            shell,
            detached: process.platform !== 'win32',
        });
        let giveUp;
        const timer = setTimeout(() => {
            timedOut = true;
            killTree(child.pid);
            // 杀了还不退出的，最多再等 10 秒。
            giveUp = setTimeout(() => finish({ code: null, output: `${output}\n[timeout]`, timedOut }), 10_000);
        }, timeoutMs);
        child.stdout.on('data', (d) => (output += d.toString()));
        child.stderr.on('data', (d) => (output += d.toString()));
        child.on('error', (error) => finish({ code: undefined, output: error.message, error }));
        child.on('close', (code) => finish(timedOut ? { code: null, output: `${output}\n[timeout]`, timedOut } : { code, output }));
    });
}
const SOURCE_LABEL = {
    npm: 'npm 官方源',
    mirror: '国内镜像 npmmirror',
    github: 'GitHub',
};
/** 装上 `version` 这个版本：按来源依次试，装上且版本号对得上就停，都不行报失败。 */
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
        // 命令找不到，换来源也没用（shell 退出码 127，Windows 是 9009）。
        if (r.error?.code === 'ENOENT' || r.code === 127 || r.code === 9009)
            return { ok: false, reason: 'no-command', output: log };
        if (r.code === 0) {
            // 命令成功不代表装上了这个版本，核对一下。
            const got = verify ? readInstalled() : version;
            if (got === version)
                return { ok: true, output: log };
            log += `\n更新命令已完成，但装上的版本是 ${got ?? '未知'}，不是 ${version}`;
            networkOnly = false;
            continue;
        }
        // 超时多半是网络问题，和连不上一样算。
        if (!r.timedOut && !NETWORK_ERROR.test(r.output))
            networkOnly = false;
    }
    return { ok: false, reason: networkOnly ? 'network' : 'failed', output: log };
}
/**
 * profile 里 pnpm 的设置文件。只有确认本插件装在 `<profile>/node_modules/dsh-lan-web-access/` 里、
 * 且 profile 的 package.json 依赖了它时才返回；从源码目录运行（测试、本地链接安装）返回 undefined。
 */
function profileWorkspaceFile() {
    const nodeModules = new URL('../../', import.meta.url);
    if (!/\/node_modules\/$/.test(nodeModules.pathname))
        return undefined;
    try {
        const pkg = JSON.parse(readFileSync(new URL('../package.json', nodeModules), 'utf8'));
        if (pkg.dependencies?.[PACKAGE_NAME] === undefined)
            return undefined;
    }
    catch {
        return undefined;
    }
    return new URL('../pnpm-workspace.yaml', nodeModules);
}
const escaped = PACKAGE_NAME.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
/** 本插件的条目：带版本号的（pnpm 每装一个新版本加一条）或不带版本号的。 */
const OWN_ENTRY = new RegExp(`^\\s*-\\s*['"]?${escaped}(@[^'"\\s]+)?['"]?\\s*$`);
const LIST_KEY = /^minimumReleaseAgeExclude:[ \t]*$/;
/** 列表下面的一行：空行、缩进的行、`-` 开头的条目、注释。遇到别的顶层键就结束。 */
const IN_BLOCK = /^(\s|-|#|$)/;
/**
 * 让「只填包名安装」总是装最新版。
 *
 * pnpm 默认不装发布不到一天的版本，每装一个新版本就往 `minimumReleaseAgeExclude` 名单加一条
 * `dsh-lan-web-access@x.y.z`；名单里本包有多条时它只认第一条，删了重装就会装回旧版。
 * 这里把名单里本插件的条目换成一条不带版本号的，对所有版本放行。别的条目、别的键都不动，
 * 换行方式和缩进照原样；名单是单行写法（`[a, b]`）时不动。
 * @returns 有没有改动文件
 */
export function allowLatestInstall(file = profileWorkspaceFile()) {
    if (file === undefined)
        return false;
    let text;
    try {
        text = readFileSync(file, 'utf8');
    }
    catch {
        return false;
    }
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    if (lines.some((l) => /^minimumReleaseAgeExclude:[ \t]*\S/.test(l)))
        return false;
    const key = lines.findIndex((l) => LIST_KEY.test(l));
    if (key === -1) {
        while (lines.length > 0 && lines[lines.length - 1] === '')
            lines.pop();
        lines.push('minimumReleaseAgeExclude:', `  - ${PACKAGE_NAME}`, '');
    }
    else {
        let end = key + 1;
        while (end < lines.length && IN_BLOCK.test(lines[end]))
            end++;
        const block = lines.slice(key + 1, end).filter((l) => !OWN_ENTRY.test(l));
        const indent = /^(\s*)-/.exec(block.find((l) => /^\s*-/.test(l)) ?? '')?.[1] ?? '  ';
        lines.splice(key + 1, end - key - 1, `${indent}- ${PACKAGE_NAME}`, ...block);
    }
    const next = lines.join(eol);
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
