/**
 * 一键更新（R-007）：查最新版本 + 用 `dsh plugin add dsh-lan-web-access@<最新版本>` 装上那个确切版本。
 *
 * 不用 `dsh plugin update`：它就是 pnpm update，只在安装时记下的范围里升级 —— 从 GitHub 带标签装的
 * （`github:…#v0.1.2`）会原样重装旧版，npm 装的记成 `^0.1.3` 也升不到 0.2.0，刚发布的版本还会被
 * pnpm 的「新版本冷静期」挡住，而命令照样成功退出（2026-10-07 Mac Desktop 真机踩到）。装确切版本号
 * 会把来源换成 npm 上这个版本；装完再核对磁盘上的版本号，对不上就报失败，不报「完成」。
 *
 * 版本源默认是 npm；发布到 npm 之前（Q-001）查不到，显示「暂时查不到新版本」，中性，不算错。
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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareVersions } from './selfcheck.ts';
import type { UpdateState } from './shared.ts';

export const PACKAGE_NAME = 'dsh-lan-web-access';
/** 查版本超时（R-007 异常处理：8 秒）。 */
export const CHECK_TIMEOUT_MS = 8000;

function registryUrl(): string {
  return (
    process.env.DSH_REMOTE_ACCESS_REGISTRY ??
    `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`
  );
}

/** 查最新版本：有新版本 → available；一样或更旧 → latest；查不到（没发布、超时、断网）→ unavailable。 */
export async function checkLatestVersion(current: string): Promise<UpdateState> {
  try {
    const res = await fetch(registryUrl(), { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    if (!res.ok) return { state: 'unavailable', current };
    const data = (await res.json()) as { version?: unknown };
    if (typeof data.version !== 'string') return { state: 'unavailable', current };
    return compareVersions(data.version, current) > 0
      ? { state: 'available', current, latest: data.version }
      : { state: 'latest', current, latest: current };
  } catch {
    return { state: 'unavailable', current };
  }
}

interface UpdateCommand {
  cmd: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
}

/** Desktop（Electron 主进程）里用于自举 CLI 的 app.asar 路径。 */
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

/** 让用户在终端手动运行的更新命令（更新命令找不到时显示）。 */
export function manualUpdateCommand(profile: string, version: string): string {
  return `dsh plugin --profile ${profile} add ${PACKAGE_NAME}@${version}`;
}

const SAFE_PROFILE = /^[A-Za-z0-9_-]+$/;
/** 版本号会拼进命令行（Windows 经 shell）：只认 x.y.z 和可选的预发布后缀。 */
const SAFE_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export function resolveUpdateCommand(
  profile: string,
  version: string,
  platform: NodeJS.Platform = process.platform,
  resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath,
): UpdateCommand | undefined {
  const fake = process.env.DSH_REMOTE_ACCESS_UPDATE_CMD;
  if (fake) return { cmd: fake, args: [], shell: true };
  if (!SAFE_VERSION.test(version)) return undefined;
  const args = ['plugin', '--profile', profile, 'add', `${PACKAGE_NAME}@${version}`];
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

/** 磁盘上本插件 package.json 的版本号（更新后核对用；读不到返回 undefined）。 */
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

/** 运行更新命令，装上 `version` 这个确切版本。超时、失败都只回报，不动设置。 */
export function runUpdate(
  profile: string,
  version: string,
  options: {
    timeoutMs?: number;
    /** 装完核对版本号；默认核对，只有演示变量代替更新命令时不核对。 */
    verify?: boolean;
    readInstalled?: () => string | undefined;
  } = {},
): Promise<UpdateResult> {
  const {
    timeoutMs = 120_000,
    verify = process.env.DSH_REMOTE_ACCESS_UPDATE_CMD === undefined,
    readInstalled = installedVersion,
  } = options;
  return new Promise((resolve) => {
    const command = resolveUpdateCommand(profile, version);
    if (command === undefined) {
      resolve({
        ok: false,
        reason: 'no-command',
        output: `profile 名或版本号不能拼进命令行：${profile} ${version}`,
      });
      return;
    }
    const { cmd, args, env, shell } = command;
    let output = '';
    let settled = false;
    const finish = (r: UpdateResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env, shell });
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, reason: 'failed', output: `${output}\n[timeout]` });
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    child.on('error', (error: NodeJS.ErrnoException) =>
      finish({
        ok: false,
        reason: error.code === 'ENOENT' ? 'no-command' : 'failed',
        output: error.message,
      }),
    );
    child.on('close', (code) => {
      if (code === 0) {
        // 命令成功不等于装上了新版本（见文件头）：核对磁盘上的版本号。
        const got = verify ? readInstalled() : version;
        if (got === version) finish({ ok: true, output });
        else
          finish({
            ok: false,
            reason: 'failed',
            output: `${output}\n更新命令已完成，但装上的版本是 ${got ?? '未知'}，不是 ${version}`,
          });
      }
      // shell 里找不到命令退出码是 127（Windows cmd 是 9009）。
      else if (code === 127 || code === 9009) finish({ ok: false, reason: 'no-command', output });
      else finish({ ok: false, reason: NETWORK_ERROR.test(output) ? 'network' : 'failed', output });
    });
  });
}
