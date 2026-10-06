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

import { spawn } from 'node:child_process';
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

/** 桌面版（Electron 主进程）里用于自举 CLI 的 app.asar 路径。 */
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
export function manualUpdateCommand(profile: string): string {
  return `dsh plugin --profile ${profile} update ${PACKAGE_NAME}`;
}

const SAFE_PROFILE = /^[A-Za-z0-9_-]+$/;

export function resolveUpdateCommand(
  profile: string,
  platform: NodeJS.Platform = process.platform,
  resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath,
): UpdateCommand | undefined {
  const fake = process.env.DSH_REMOTE_ACCESS_UPDATE_CMD;
  if (fake) return { cmd: fake, args: [], shell: true };
  const args = ['plugin', '--profile', profile, 'update', PACKAGE_NAME];
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

/** 运行更新命令。超时、失败都只回报，不动设置。 */
export function runUpdate(profile: string, timeoutMs = 120_000): Promise<UpdateResult> {
  return new Promise((resolve) => {
    const command = resolveUpdateCommand(profile);
    if (command === undefined) {
      resolve({ ok: false, reason: 'no-command', output: `profile 名不能拼进命令行：${profile}` });
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
      if (code === 0) finish({ ok: true, output });
      // shell 里找不到命令退出码是 127（Windows cmd 是 9009）。
      else if (code === 127 || code === 9009) finish({ ok: false, reason: 'no-command', output });
      else finish({ ok: false, reason: NETWORK_ERROR.test(output) ? 'network' : 'failed', output });
    });
  });
}
