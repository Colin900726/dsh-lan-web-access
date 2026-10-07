/** 运行检查：启动时和点「重新检查」时跑五项。前四项有没过的就安全退出；第五项（没设密码）只是提示。 */
import { createRequire } from 'node:module';
import { loadSigningSecret } from "./native-cookie.js";
import { COMPAT_BELOW, COMPAT_MIN } from "./shared.js";
/** 读 dsh 的版本号，读不到返回 null。 */
export function readDshVersion() {
    try {
        const require = createRequire(import.meta.url);
        const pkg = require('@deepseek-ai/dsh/package.json');
        return pkg?.version;
    }
    catch {
        return undefined;
    }
}
/** 比较两个版本号（预发布版低于同号正式版），返回负数 / 0 / 正数。 */
export function compareVersions(a, b) {
    const [ma, pa] = splitVersion(a);
    const [mb, pb] = splitVersion(b);
    for (let i = 0; i < Math.max(ma.length, mb.length); i += 1) {
        const x = ma[i] ?? 0;
        const y = mb[i] ?? 0;
        if (x !== y)
            return x - y;
    }
    if (pa.length === 0 || pb.length === 0)
        return pb.length - pa.length;
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
        const x = pa[i];
        const y = pb[i];
        if (x === undefined)
            return -1;
        if (y === undefined)
            return 1;
        if (x === y)
            continue;
        const nx = /^\d+$/.test(x);
        const ny = /^\d+$/.test(y);
        if (nx && ny)
            return Number(x) - Number(y);
        if (nx !== ny)
            return nx ? -1 : 1;
        return x < y ? -1 : 1;
    }
    return 0;
}
function splitVersion(v) {
    const [main = '', pre] = v.trim().replace(/^v/, '').split('-', 2);
    return [main.split('.').map(Number), pre === undefined ? [] : pre.split('.')];
}
/** dsh 版本在不在支持范围内。 */
export { COMPAT_BELOW, COMPAT_MIN };
export function dshVersionInRange(v) {
    return compareVersions(v, COMPAT_MIN) >= 0 && compareVersions(v, COMPAT_BELOW) < 0;
}
/** 前四项：任一不过就安全退出。 */
export const CRITICAL_CHECKS = [
    'webServer',
    'signing',
    'sessionKey',
    'dshVersion',
];
/** 测试用：DSH_REMOTE_ACCESS_FAKE_FAIL=signing,dshVersion 让这几项按没通过处理。 */
function fakeFailures() {
    return new Set((process.env.DSH_REMOTE_ACCESS_FAKE_FAIL ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean));
}
export async function runSelfCheck(rt) {
    const fake = fakeFailures();
    const settings = rt.settingsStore.get();
    const port = rt.webServer?.port;
    const webOk = rt.webServer !== undefined && typeof rt.webServer.register === 'function';
    const signingOk = (await loadSigningSecret(rt.getCredentials())) !== undefined;
    const keyOk = settings.sessionSecret !== null;
    const dshVersion = readDshVersion() ?? null;
    // 读不到版本号不算失败，只是提示。
    const versionOk = dshVersion === null || dshVersionInRange(dshVersion);
    const results = [
        { id: 'webServer', state: webOk ? 'ok' : 'bad', port },
        { id: 'signing', state: signingOk ? 'ok' : 'bad' },
        { id: 'sessionKey', state: keyOk ? 'ok' : 'bad' },
        { id: 'dshVersion', state: versionOk ? 'ok' : 'warn', version: dshVersion },
        { id: 'password', state: settings.passwordHash !== null ? 'ok' : 'idle' },
    ];
    for (const r of results)
        if (fake.has(r.id))
            r.state = r.id === 'dshVersion' ? 'warn' : r.id === 'password' ? 'idle' : 'bad';
    return results;
}
/** 前四项里没通过的。 */
export function criticalFailures(results) {
    return results.filter((r) => CRITICAL_CHECKS.includes(r.id) && r.state !== 'ok');
}
