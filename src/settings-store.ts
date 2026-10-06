/**
 * 运行时设置持久化：`$DSH_HOME/remote-access.json`（0600，目录 0700）。
 *
 * 不写 cordis.patch.yml：patch 是整行替换、改配置触发热重载，容易覆盖用户手写。
 * 写入用「临时文件 + 原子 rename」避免半截文件。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Settings, DEFAULT_SETTINGS, normalizeSettings } from './settings.ts';
import { makeSessionSecret } from './session-store.ts';

/**
 * dsh 的数据目录，规则与 dsh 自己（@deepseek-ai/dsh-home-paths 的 resolveDshHome）一致：
 * `$DSH_HOME`（空白当没设；支持 `~`、`~/`、`~\\` 开头）优先，否则「用户目录/.dsh」。
 * macOS 和 Windows 都按 Node 的路径规则拼，不手写分隔符（R-022）。
 */
export function dshHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.DSH_HOME;
  const raw =
    fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), '.dsh');
  const expanded =
    raw === '~'
      ? homedir()
      : raw.startsWith('~/') || raw.startsWith('~\\')
        ? join(homedir(), raw.slice(2))
        : raw;
  return resolve(expanded);
}

export function settingsFile(): string {
  return process.env.DSH_REMOTE_ACCESS_FILE ?? join(dshHome(), 'remote-access.json');
}

export class SettingsStore {
  private settings: Settings;
  private listeners = new Set<(s: Settings) => void>();

  constructor(initial?: Settings) {
    this.settings = initial ?? this.load();
  }

  private load(): Settings {
    const file = settingsFile();
    if (!existsSync(file)) {
      const seeded = { ...DEFAULT_SETTINGS, sessionSecret: makeSessionSecret() };
      this.write(seeded);
      return seeded;
    }
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      const normalized = normalizeSettings(raw);
      if (normalized.sessionSecret === null) {
        normalized.sessionSecret = makeSessionSecret();
        this.write(normalized);
      }
      return normalized;
    } catch {
      return { ...DEFAULT_SETTINGS, sessionSecret: makeSessionSecret() };
    }
  }

  private write(next: Settings): void {
    const file = settingsFile();
    mkdirSync(dshHome(), { recursive: true, mode: 0o700 });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, file);
    try {
      chmodSync(file, 0o600);
    } catch {
      // 某些平台 rename 后 chmod 可能失败，忽略。
    }
  }

  get(): Settings {
    return this.settings;
  }

  /** 合并写入并通知监听者。 */
  update(patch: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...patch };
    this.write(this.settings);
    for (const fn of this.listeners) fn(this.settings);
    return this.settings;
  }

  /** 注册变更监听，返回取消函数。 */
  onChange(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
