/** 访问记录：内存里留最近 200 条。 */
import type { AccessLogEntry } from './settings.ts';
export declare class AccessLog {
    private entries;
    private readonly max;
    constructor(max?: number);
    record(kind: AccessLogEntry['kind'], ip: string, detail: string): void;
    list(): AccessLogEntry[];
    clear(): void;
}
