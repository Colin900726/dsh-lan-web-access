/** 电脑名：macOS 取「关于本机」里的名称，Windows 取计算机名，其他用主机名。取不到返回空串。 */

import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';

let cached: string | undefined;

export function computerName(): string {
  cached ??= resolveComputerName();
  return cached;
}

/** 按系统取电脑名（参数可替换，方便测试）。 */
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
