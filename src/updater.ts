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
import { compareVersions } from './selfcheck.ts';
import type { UpdateState } from './shared.ts';

export const PACKAGE_NAME = 'dsh-lan-web-access';
/** 查版本超时。 */
export const CHECK_TIMEOUT_MS = 8000;

export const NPM_REGISTRY = 'https://registry.npmjs.org';
export const MIRROR_REGISTRY = 'https://registry.npmmirror.com';
export const GITHUB_REPO = 'Colin900726/dsh-lan-web-access';

function versionUrls(): string[] {
  const fake = process.env.DSH_REMOTE_ACCESS_REGISTRY;
  if (fake) return [fake];
  const path = `/${encodeURIComponent(PACKAGE_NAME)}/latest`;
  return [NPM_REGISTRY + path, MIRROR_REGISTRY + path];
}

async function fetchVersion(url: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { version?: unknown };
    return typeof data.version === 'string' ? data.version : undefined;
  } catch {
    return undefined;
  }
}

/** 同时问 npm 官方源和国内镜像，取较高的版本；都查不到算 unavailable。 */
export async function checkLatestVersion(current: string): Promise<UpdateState> {
  const signal = AbortSignal.timeout(CHECK_TIMEOUT_MS);
  const found = (await Promise.all(versionUrls().map((u) => fetchVersion(u, signal)))).filter(
    (v): v is string => v !== undefined,
  );
  if (found.length === 0) return { state: 'unavailable', current };
  const newest = found.reduce((a, b) => (compareVersions(b, a) > 0 ? b : a));
  return compareVersions(newest, current) > 0
    ? { state: 'available', current, latest: newest }
    : { state: 'latest', current, latest: current };
}

interface UpdateCommand {
  cmd: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
}

/** Desktop 自带的 dsh 命令行入口。 */
function desktopCliPath(resourcesPath: string): string {
  return join(
    resourcesPath,
    'app.asar',
    'dsh',
    'node_modules',
    '@deepseek-ai',
    'dsh-desktop-host',
    'lib',
    'cli.js',
  );
}

/** 自动更新跑不起来时，给用户手动运行的命令。 */
export function manualUpdateCommand(profile: string, version: string): string {
  return `dsh plugin --profile ${profile} add ${PACKAGE_NAME}@${version}`;
}

const SAFE_PROFILE = /^[A-Za-z0-9_-]+$/;
/** 版本号要拼进命令行：只认 x.y.z(-预发布)。 */
const SAFE_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** 依次尝试的安装来源。 */
export type UpdateSource = 'npm' | 'mirror' | 'github';
export const UPDATE_SOURCES: readonly UpdateSource[] = ['npm', 'mirror', 'github'];

/** 某个来源下 `dsh plugin add` 后面的参数。 */
function addArgs(version: string, source: UpdateSource): string[] {
  if (source === 'github') return [`github:${GITHUB_REPO}#v${version}`];
  const spec = `${PACKAGE_NAME}@${version}`;
  return source === 'mirror' ? [spec, `--registry=${MIRROR_REGISTRY}`] : [spec];
}

export function resolveUpdateCommand(
  profile: string,
  version: string,
  platform: NodeJS.Platform = process.platform,
  resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath,
  source: UpdateSource = 'npm',
): UpdateCommand | undefined {
  const fake = process.env.DSH_REMOTE_ACCESS_UPDATE_CMD;
  if (fake) return { cmd: fake, args: [], shell: true };
  if (!SAFE_VERSION.test(version)) return undefined;
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
    if (!SAFE_PROFILE.test(profile)) return undefined;
    return { cmd: 'dsh.cmd', args, shell: true };
  }
  return { cmd: 'dsh', args };
}

export interface UpdateResult {
  ok: boolean;
  reason?: 'network' | 'no-command' | 'failed';
  output: string;
}

const NETWORK_ERROR = /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network/i;

/** 磁盘上本插件的版本号，更新后核对用。 */
export function installedVersion(): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version?: unknown;
    };
    return typeof pkg.version === 'string' ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

/** 跑一次命令，返回退出码和输出。 */
function runOnce(
  command: UpdateCommand,
  timeoutMs: number,
): Promise<{ code: number | null | undefined; output: string; error?: NodeJS.ErrnoException }> {
  return new Promise((resolve) => {
    const { cmd, args, env, shell } = command;
    let output = '';
    let settled = false;
    const finish = (r: {
      code: number | null | undefined;
      output: string;
      error?: NodeJS.ErrnoException;
    }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env, shell });
    const timer = setTimeout(() => {
      child.kill();
      finish({ code: null, output: `${output}\n[timeout]` });
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    child.on('error', (error: NodeJS.ErrnoException) =>
      finish({ code: undefined, output: error.message, error }),
    );
    child.on('close', (code) => finish({ code, output }));
  });
}

const SOURCE_LABEL: Record<UpdateSource, string> = {
  npm: 'npm 官方源',
  mirror: '国内镜像 npmmirror',
  github: 'GitHub',
};

/** 装上 `version` 这个版本：按来源依次试，装上且版本号对得上就停，都不行报失败。 */
export async function runUpdate(
  profile: string,
  version: string,
  options: {
    /** 每个来源的超时。 */
    timeoutMs?: number;
    /** 装完核对版本号（用测试命令时默认不核对）。 */
    verify?: boolean;
    readInstalled?: () => string | undefined;
    sources?: readonly UpdateSource[];
  } = {},
): Promise<UpdateResult> {
  const {
    timeoutMs = 120_000,
    verify = process.env.DSH_REMOTE_ACCESS_UPDATE_CMD === undefined,
    readInstalled = installedVersion,
    sources = process.env.DSH_REMOTE_ACCESS_UPDATE_CMD === undefined ? UPDATE_SOURCES : ['npm'],
  } = options;
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
      if (got === version) return { ok: true, output: log };
      log += `\n更新命令已完成，但装上的版本是 ${got ?? '未知'}，不是 ${version}`;
      networkOnly = false;
      continue;
    }
    if (!NETWORK_ERROR.test(r.output)) networkOnly = false;
  }
  return { ok: false, reason: networkOnly ? 'network' : 'failed', output: log };
}

/** profile 里 pnpm 的设置文件（本插件装在 `<profile>/node_modules/dsh-lan-web-access/`）。 */
function profileWorkspaceFile(): URL {
  return new URL('../../../pnpm-workspace.yaml', import.meta.url);
}

const VERSIONED_ENTRY = /^\s*-\s*['"]?dsh-lan-web-access@[^'"\s]+['"]?\s*$/;
const NAME_ENTRY = /^\s*-\s*['"]?dsh-lan-web-access['"]?\s*$/;
const LIST_KEY = /^minimumReleaseAgeExclude:[ \t]*$/;

/**
 * 让「只填包名安装」总是装最新版。
 *
 * pnpm 默认不装发布不到一天的版本，每装一个新版本就往 `minimumReleaseAgeExclude` 名单加一条
 * `dsh-lan-web-access@x.y.z`；名单里本包有多条时它只认第一条，删了重装就会装回旧版。
 * 这里把本插件的条目换成一条不带版本号的，对所有版本放行。别的包的条目不动。
 * @returns 有没有改动文件
 */
export function allowLatestInstall(file: URL = profileWorkspaceFile()): boolean {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  if (/^minimumReleaseAgeExclude:[ \t]*\S/m.test(text)) return false;
  const lines = text.split('\n').filter((l) => !VERSIONED_ENTRY.test(l) && !NAME_ENTRY.test(l));
  const at = lines.findIndex((l) => LIST_KEY.test(l));
  if (at === -1) {
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    lines.push('minimumReleaseAgeExclude:', '  - dsh-lan-web-access', '');
  } else {
    const indent = /^(\s*)-/.exec(lines[at + 1] ?? '')?.[1] ?? '  ';
    lines.splice(at + 1, 0, `${indent}- dsh-lan-web-access`);
  }
  const next = lines.join('\n');
  if (next === text) return false;
  try {
    writeFileSync(file, next);
    return true;
  } catch {
    return false;
  }
}
