import { z } from 'zod';
import { getCookie } from 'nitro/h3';
import { otp, password, studentId } from '../../../shared/schema';
import { api, actor, body, clientIp, sessionCookies } from '../../lib/http';
import { beginSetup, checkAdminOtp, finishSetup, hashPassword, initialized, rateLimit, verifyPassword } from '../../lib/auth';
import { authenticateAccess, issueSession, logoutSession, refreshSession } from '../../lib/sessions';
import { audit, getDb } from '../../lib/db';
import { AppError, ensure } from '../../lib/errors';
import { getSettings } from '../../lib/settings';

let dummyHash: Promise<string> | undefined;
export default api(async event => {
  const action = event.url.pathname.split('/').pop();
  if (event.req.method === 'GET' && action === 'session') {
    const session = await authenticateAccess(getCookie(event, 'pvedc_session'));
    ensure(session || !getCookie(event, 'pvedc_refresh'), 401, '需要刷新登录状态', 'AUTH_REQUIRED');
    return { actor: session?.actor || null, expiresAt: session?.expiresAt, refreshExpiresAt: session?.refreshExpiresAt, initialized: initialized(), title: getSettings().title };
  }
  ensure(event.req.method === 'POST', 405, '请求方法不支持');
  if (action === 'refresh') {
    rateLimit('refresh:' + clientIp(event), 300, 60);
    try {
      const session = await refreshSession(getCookie(event, 'pvedc_refresh'));
      sessionCookies(event, session);
      return { actor: session.actor, expiresAt: session.expiresAt, refreshExpiresAt: session.refreshExpiresAt };
    } catch (error) {
      if (error instanceof AppError && error.status === 401) sessionCookies(event);
      throw error;
    }
  }
  if (action === 'logout') {
    await logoutSession(getCookie(event, 'pvedc_session'), getCookie(event, 'pvedc_refresh'));
    sessionCookies(event);
    return { ok: true };
  }
  if (action === 'admin') {
    rateLimit('admin-account');
    rateLimit('admin:' + clientIp(event));
    const { code } = await body(event, z.object({ code: otp }));
    checkAdminOtp(code);
    const session = await issueSession('admin', 'admin');
    sessionCookies(event, session);
    audit('admin', 'login');
    return { actor: session.actor, expiresAt: session.expiresAt };
  }
  if (action === 'student') {
    rateLimit('student-ip:' + clientIp(event), 300);
    const input = await body(event, z.object({ studentId, password }));
    rateLimit('student-id:' + input.studentId);
    const student = getDb().prepare('SELECT password_hash, enabled FROM students WHERE id=?').get(input.studentId) as { password_hash: string | null; enabled: number } | undefined;
    dummyHash ??= hashPassword('dummy-password-do-not-use');
    const valid = await verifyPassword(student?.password_hash || await dummyHash, input.password);
    ensure(valid && student?.enabled && student.password_hash, 401, '学号或密码不正确');
    const session = await issueSession('student', input.studentId);
    sessionCookies(event, session);
    audit(input.studentId, 'login');
    return { actor: session.actor, expiresAt: session.expiresAt };
  }
  const user = await actor(event);
  ensure(user.role === 'admin', 403, '仅管理员可操作');
  rateLimit('totp-rotate:' + user.sessionId);
  if (action === 'rotate-begin') {
    const { code } = await body(event, z.object({ code: otp }));
    checkAdminOtp(code);
    return beginSetup(user.sessionId, true);
  }
  if (action === 'rotate-complete') {
    const { code } = await body(event, z.object({ code: otp }));
    finishSetup(user.sessionId, code, true);
    const session = await issueSession('admin', 'admin');
    sessionCookies(event, session);
    return { ok: true };
  }
  ensure(false, 404, '接口不存在');
});
