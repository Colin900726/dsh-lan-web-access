import { NATIVE_COOKIE_VERSION, SIGNING_SECRET_BYTES } from '../src/native-cookie.ts';
import type { CredentialsLike } from '../src/native-cookie.ts';

/** 假的 dsh credentials 服务：读得到一把格式正确的登录签名密钥（运行检查第 2 项能过）。 */
export function fakeCredentials(): CredentialsLike {
  const secret = Buffer.alloc(SIGNING_SECRET_BYTES, 7).toString('base64url');
  return {
    readRecord: () =>
      Promise.resolve({ kind: 'grant', payload: { version: NATIVE_COOKIE_VERSION, secret } }),
  } as unknown as CredentialsLike;
}
