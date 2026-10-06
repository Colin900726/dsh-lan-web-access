/**
 * 访问日志环形缓冲（最近 200 条，内存）。
 */

import type { AccessLogEntry } from './settings.ts';

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

  constructor(max = 200) {
    this.max = max;
  }

  record(kind: AccessLogEntry['kind'], ip: string, detail: string): void {
    const now = Date.now();
    // 不在列表里的设备每发一个请求都会被拒：同一设备、同一类拒绝，一分钟内合并成一条记次数，
    // 免得几百个请求把 200 条记录冲掉，真正的登录、踢下线记录看不到。
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
