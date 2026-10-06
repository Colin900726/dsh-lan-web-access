/**
 * 访问日志环形缓冲（最近 200 条，内存）。
 */
import type { AccessLogEntry } from './settings.ts';
export declare class AccessLog {
    private entries;
    private readonly max;
    constructor(max?: number);
    record(kind: AccessLogEntry['kind'], ip: string, detail: string): void;
    list(): AccessLogEntry[];
    clear(): void;
}
