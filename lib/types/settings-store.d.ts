/** 读写设置文件 `~/.dsh/remote-access.json`（仅本人可读）。先写临时文件再改名，不会写出半截文件。 */
import { Settings } from './settings.ts';
/** dsh 的数据目录：有 `$DSH_HOME` 用它（支持 `~` 开头），否则是「用户目录/.dsh」。规则和 dsh 一致。 */
export declare function dshHome(env?: NodeJS.ProcessEnv): string;
export declare function settingsFile(): string;
export declare class SettingsStore {
    private settings;
    private listeners;
    constructor(initial?: Settings);
    private load;
    private write;
    get(): Settings;
    /** 合并写入并通知监听者（notify 为 false 时只写不通知，用于记录类数据）。 */
    update(patch: Partial<Settings>, notify?: boolean): Settings;
    /** 注册变更监听，返回取消函数。 */
    onChange(fn: (s: Settings) => void): () => void;
}
