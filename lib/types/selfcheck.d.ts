/** 运行检查：启动时和点「重新检查」时跑五项。前四项有没过的就安全退出；第五项（没设密码）只是提示。 */
import { COMPAT_BELOW, COMPAT_MIN, type CheckId, type CheckResult } from './shared.ts';
import type { Runtime } from './runtime.ts';
/** 读 dsh 的版本号，读不到返回 null。 */
export declare function readDshVersion(): string | undefined;
/** 比较两个版本号（预发布版低于同号正式版），返回负数 / 0 / 正数。 */
export declare function compareVersions(a: string, b: string): number;
/** dsh 版本在不在支持范围内。 */
export { COMPAT_BELOW, COMPAT_MIN };
export declare function dshVersionInRange(v: string): boolean;
/** 前四项：任一不过就安全退出。 */
export declare const CRITICAL_CHECKS: readonly CheckId[];
export declare function runSelfCheck(rt: Runtime): Promise<CheckResult[]>;
/** 前四项里没通过的。 */
export declare function criticalFailures(results: readonly CheckResult[]): CheckResult[];
