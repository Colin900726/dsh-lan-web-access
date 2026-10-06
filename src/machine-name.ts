/**
 * 装 dsh 那台电脑的名字（登录页写「{电脑名} 上的 dsh」）。
 * macOS 取「系统设置 → 通用 → 关于本机 → 名称」（scutil --get ComputerName）；
 * Windows 取计算机名；其他系统用主机名并去掉 .local。取不到返回空串，由页面写「这台电脑」。
 */

import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';

let cached: string | undefined;

export function computerName(): string {
  cached ??= resolveComputerName();
  return cached;
}

/** 按系统取电脑名（参数可替换，便于在 macOS 上测 Windows 的分支）。 */
export function resolveComputerName(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  readMacName: () => string = () =>
    execFileSync('scutil', ['--get', 'ComputerName'], { encoding: 'utf8', timeout: 2000 }),
  host: string = hostname(),
): string {
  let name = '';
  if (platform === 'darwin') {
    try {
      name = readMacName().trim();
    } catch {
      name = '';
    }
  } else if (platform === 'win32') {
    name = (env.COMPUTERNAME ?? '').trim();
  }
  return name !== '' ? name : host.replace(/\.local$/i, '');
}
