/** 访问记录：内存里留最近 ACCESS_LOG_MAX 条。 */

import type { AccessLogEntry } from './settings.ts';
import { ACCESS_LOG_MAX } from './shared.ts';

/** 会合并的拒绝类记录，以及合并的时间窗口。 */
const MERGED_KINDS = new Set<AccessLogEntry['kind']>([
  'whitelist-deny',
  'unauthorized',
  'cross-site',
]);
const MERGE_WINDOW_MS = 60_000;

export class AccessLog {
  private entries: AccessLogEntry[] = [];
  private readonly max: number;

  constructor(max = ACCESS_LOG_MAX) {
    this.max = max;
  }

  record(kind: AccessLogEntry['kind'], ip: string, detail: string): void {
    const now = Date.now();
    // 同一设备同一类拒绝，一分钟内合并成一条，免得把重要记录冲掉。
    if (MERGED_KINDS.has(kind)) {
      for (let i = this.entries.length - 1; i >= 0; i--) {
        const e = this.entries[i]!;
        if (now - e.ts > MERGE_WINDOW_MS) break;
        if (e.kind === kind && e.ip === ip) {
          this.entries.splice(i, 1);
          this.entries.push({ ...e, ts: now, detail, count: (e.count ?? 1) + 1 });
          return;
        }
      }
    }
    this.entries.push({ ts: now, kind, ip, detail });
    if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max);
  }

  list(): AccessLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
