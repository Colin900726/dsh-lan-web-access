import {
  issueNativeCookie,
  NATIVE_COOKIE_VERSION,
  SIGNING_SECRET_BYTES,
} from '../src/native-cookie.ts';
import type { CredentialsLike } from '../src/native-cookie.ts';

/** 假的 dsh credentials 服务：读得到一把格式正确的登录签名密钥（运行检查第 2 项能过）。 */
export function fakeCredentials(): CredentialsLike {
  const secret = Buffer.alloc(SIGNING_SECRET_BYTES, 7).toString('base64url');
  return {
    readRecord: () =>
      Promise.resolve({ kind: 'grant', payload: { version: NATIVE_COOKIE_VERSION, secret } }),
  } as unknown as CredentialsLike;
}

/** 用上面那把密钥签的一张 dsh cookie（`name=value`），相当于浏览器用 dsh 官方 token 登录过。 */
export function dshCookie(authority = '127.0.0.1:3080'): string {
  const set = issueNativeCookie(Buffer.alloc(SIGNING_SECRET_BYTES, 7), authority);
  return set.slice(0, set.indexOf(';'));
}

/**
 * 测试用的假更新命令：用 node 跑一小段脚本，macOS / Linux 的 sh 和 Windows 的 cmd 都能执行。
 * 脚本里只用单引号；args 依次是 process.argv[1]、[2]……
 */
export function nodeCmd(js: string, ...args: string[]): string {
  return [`"${process.execPath}"`, '-e', `"${js}"`, ...args.map((a) => `"${a}"`)].join(' ');
}
