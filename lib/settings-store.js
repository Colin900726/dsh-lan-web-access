/** 读写设置文件 `~/.dsh/remote-access.json`（仅本人可读）。先写临时文件再改名，不会写出半截文件。 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.js";
import { makeSessionSecret } from "./session-store.js";
/** dsh 的数据目录：有 `$DSH_HOME` 用它（支持 `~` 开头），否则是「用户目录/.dsh」。规则和 dsh 一致。 */
export function dshHome(env = process.env) {
    const fromEnv = env.DSH_HOME;
    const raw = fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), '.dsh');
    const expanded = raw === '~'
        ? homedir()
        : raw.startsWith('~/') || raw.startsWith('~\\')
            ? join(homedir(), raw.slice(2))
            : raw;
    return resolve(expanded);
}
export function settingsFile() {
    return process.env.DSH_REMOTE_ACCESS_FILE ?? join(dshHome(), 'remote-access.json');
}
export class SettingsStore {
    settings;
    listeners = new Set();
    constructor(initial) {
        this.settings = initial ?? this.load();
    }
    load() {
        const file = settingsFile();
        if (!existsSync(file)) {
            const seeded = { ...DEFAULT_SETTINGS, sessionSecret: makeSessionSecret() };
            this.write(seeded);
            return seeded;
        }
        try {
            const raw = JSON.parse(readFileSync(file, 'utf8'));
            const normalized = normalizeSettings(raw);
            if (normalized.sessionSecret === null) {
                normalized.sessionSecret = makeSessionSecret();
                this.write(normalized);
            }
            return normalized;
        }
        catch {
            return { ...DEFAULT_SETTINGS, sessionSecret: makeSessionSecret() };
        }
    }
    /**
     * Desktop 和 Web 可能同时在跑、共用这个文件：插件签发 cookie 的记录不能被对方整份覆盖掉，
     * 写之前把文件里现有的合并进来（去重、去掉过期的），开始记录的时间取较晚的。
     */
    mergeMintRecords(next) {
        let onDisk;
        try {
            onDisk = normalizeSettings(JSON.parse(readFileSync(settingsFile(), 'utf8')));
        }
        catch {
            return next;
        }
        const now = Date.now();
        const byHash = new Map();
        for (const x of [...onDisk.pluginMintedCookies, ...next.pluginMintedCookies])
            if (x.exp > now)
                byHash.set(x.h, x);
        const since = onDisk.mintTrackingSince === null || next.mintTrackingSince === null
            ? (next.mintTrackingSince ?? onDisk.mintTrackingSince)
            : Math.max(onDisk.mintTrackingSince, next.mintTrackingSince);
        return { ...next, pluginMintedCookies: [...byHash.values()], mintTrackingSince: since };
    }
    write(next) {
        const file = settingsFile();
        mkdirSync(dshHome(), { recursive: true, mode: 0o700 });
        const tmp = `${file}.tmp`;
        writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
        renameSync(tmp, file);
        try {
            chmodSync(file, 0o600);
        }
        catch {
            // 有的系统上改权限会失败，忽略。
        }
    }
    get() {
        return this.settings;
    }
    /** 合并写入并通知监听者（notify 为 false 时只写不通知，用于记录类数据）。 */
    update(patch, notify = true) {
        this.settings = this.mergeMintRecords({ ...this.settings, ...patch });
        this.write(this.settings);
        if (notify)
            for (const fn of this.listeners)
                fn(this.settings);
        return this.settings;
    }
    /** 注册变更监听，返回取消函数。 */
    onChange(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
}
