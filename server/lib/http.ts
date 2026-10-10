import { defineHandler, type H3Event } from 'nitro';
import { assertBodySize, getCookie, getRequestIP, getRequestURL, setCookie } from 'nitro/h3';
import { ZodError, type ZodType } from 'zod';
import type { Actor } from '../../shared/schema';
import { authenticateAccess, type SessionTokens } from './sessions';
import { now } from './db';
import { AppError, ensure } from './errors';
import { getSettings } from './settings';

export const clientIp = (event: H3Event) => {
  const peer = getRequestIP(event) || 'unknown';
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) ? getRequestIP(event, { xForwardedFor: true }) || peer : peer;
};
function browserUrl(event: H3Event) {
  const peer = getRequestIP(event);
  return getRequestURL(event, { xForwardedHost: false, xForwardedProto: ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer || '') });
}
export function cookieSecurity(event: H3Event) {
  const external = getSettings().publicOrigin;
  return { httpOnly: true, sameSite: 'strict' as const, secure: browserUrl(event).protocol === 'https:' || (external.startsWith('https:') && event.req.headers.get('origin') === new URL(external).origin) };
}
export function api(handler: (event: H3Event) => unknown | Promise<unknown>) {
  return defineHandler(async event => {
    event.res.headers.set('Cache-Control', 'no-store');
    event.res.headers.set('X-Content-Type-Options', 'nosniff');
    event.res.headers.set('Referrer-Policy', 'same-origin');
    try {
      if (!['GET', 'HEAD'].includes(event.req.method)) {
        await assertBodySize(event, 2 * 1024 * 1024);
        const origin = event.req.headers.get('origin');
        const external = getSettings().publicOrigin;
        ensure(origin === browserUrl(event).origin || (external && origin === new URL(external).origin), 403, '请求来源无效');
        ensure(event.req.headers.get('content-type')?.startsWith('application/json'), 415, '请求必须为 JSON');
      }
      return await handler(event);
    } catch (error) {
      if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message || '输入无效', code: 'VALIDATION' }, { status: 400 });
      if (error instanceof AppError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
      if ((error as { status?: number })?.status === 413) return Response.json({ error: '请求内容超过 2 MiB 限制', code: 'BODY_TOO_LARGE' }, { status: 413 });
      const sqlite = error as { code?: string };
      if (sqlite.code?.startsWith('SQLITE_CONSTRAINT')) return Response.json({ error: '记录冲突或仍被资源引用，请刷新后重试', code: 'CONFLICT' }, { status: 409 });
      console.error('[api]', event.req.method, event.url.pathname, error instanceof Error ? error.name : 'UnknownError');
      return Response.json({ error: '服务处理失败，请查看管理员诊断', code: 'INTERNAL' }, { status: 500 });
    }
  });
}
export async function body<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  let value: unknown;
  try { value = await event.req.json(); } catch { throw new AppError(400, 'JSON 格式错误'); }
  return schema.parse(value);
}
export async function actor(event: H3Event, role?: Actor['role']) {
  const user = (await authenticateAccess(getCookie(event, 'pvedc_session')))?.actor;
  ensure(user, 401, '登录已失效，请重新登录', 'AUTH_REQUIRED');
  ensure(!role || user.role === role, 403, '没有权限执行此操作');
  return user;
}
export function sessionCookies(event: H3Event, session?: SessionTokens) {
  setCookie(event, 'pvedc_session', session?.token || '', { ...cookieSecurity(event), path: '/', maxAge: session ? Math.max(0, session.expiresAt - now()) : 0 });
  setCookie(event, 'pvedc_refresh', session?.refreshToken || '', { ...cookieSecurity(event), path: '/api/auth', maxAge: session ? Math.max(0, session.refreshExpiresAt - now()) : 0 });
}
