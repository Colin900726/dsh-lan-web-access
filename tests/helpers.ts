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
