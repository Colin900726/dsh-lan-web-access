/** 插件的登录 cookie（`dsh_sid`）。 */

import type { IncomingMessage } from 'node:http';

export const SESSION_COOKIE = 'dsh_sid';

/** 从 Cookie 头里取出指定名字的值。 */
export function parseCookieValue(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  for (const segment of header.split(';')) {
    const eq = segment.indexOf('=');
    if (eq === -1) continue;
    if (segment.slice(0, eq).trim() === name) return segment.slice(eq + 1).trim();
  }
  return undefined;
}

export function readSessionToken(req: IncomingMessage): string | undefined {
  return parseCookieValue(req.headers.cookie, SESSION_COOKIE);
}

export function sessionCookieSet(token: string, maxAgeSec: number): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function sessionCookieClear(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
