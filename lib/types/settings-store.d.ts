/**
 * 运行时设置持久化：`$DSH_HOME/remote-access.json`（0600，目录 0700）。
 *
 * 不写 cordis.patch.yml：patch 是整行替换、改配置触发热重载，容易覆盖用户手写。
 * 写入用「临时文件 + 原子 rename」避免半截文件。
 */
import { Settings } from './settings.ts';
/**
 * dsh 的数据目录，规则与 dsh 自己（@deepseek-ai/dsh-home-paths 的 resolveDshHome）一致：
 * `$DSH_HOME`（空白当没设；支持 `~`、`~/`、`~\\` 开头）优先，否则「用户目录/.dsh」。
 * macOS 和 Windows 都按 Node 的路径规则拼，不手写分隔符（R-022）。
 */
export declare function dshHome(env?: NodeJS.ProcessEnv): string;
export declare function settingsFile(): string;
export declare class SettingsStore {
    private settings;
    private listeners;
    constructor(initial?: Settings);
    private load;
    private write;
    get(): Settings;
    /** 合并写入并通知监听者。 */
    update(patch: Partial<Settings>): Settings;
    /** 注册变更监听，返回取消函数。 */
    onChange(fn: (s: Settings) => void): () => void;
}
