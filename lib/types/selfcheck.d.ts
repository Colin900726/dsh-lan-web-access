/**
 * 运行检查（R-015 / R-008）：dsh 启动时和点「重新检查」时跑五项。
 * 前四项任一不过 → 安全退出（停止免登录、关闭局域网入口，见 index.ts）；第五项没设密码只是中性提示。
 * 这里只给结论和数据，给人看的句子在前端文案表里。
 */
import { COMPAT_BELOW, COMPAT_MIN, type CheckId, type CheckResult } from './shared.ts';
import type { Runtime } from './runtime.ts';
/** 尽力读取宿主运行时 @deepseek-ai/dsh 的版本号。 */
export declare function readDshVersion(): string | undefined;
/** 比较 `x.y.z[-pre]`（semver 规则：预发布版低于同号正式版），返回负数 / 0 / 正数。 */
export declare function compareVersions(a: string, b: string): number;
/** 本插件支持的 dsh 版本：[最低, 不含的上限)，与 package.json peerDependencies 一致。 */
export { COMPAT_BELOW, COMPAT_MIN };
export declare function dshVersionInRange(v: string): boolean;
/** 前四项：任一不过就安全退出。 */
export declare const CRITICAL_CHECKS: readonly CheckId[];
export declare function runSelfCheck(rt: Runtime): Promise<CheckResult[]>;
/** 前四项里没通过的。 */
export declare function criticalFailures(results: readonly CheckResult[]): CheckResult[];
