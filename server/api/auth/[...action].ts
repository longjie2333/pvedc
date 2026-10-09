import { z } from 'zod';
import { getCookie } from 'nitro/h3';
import { otp, password, studentId } from '../../../shared/schema';
import { api, actor, body, clientIp, sessionCookie } from '../../lib/http';
import { authenticate, beginSetup, checkAdminOtp, finishSetup, hashPassword, initialized, issueSession, rateLimit, verifyPassword } from '../../lib/auth';
import { audit, getDb } from '../../lib/db';
import { ensure } from '../../lib/errors';
import { getSettings } from '../../lib/settings';

let dummyHash: Promise<string> | undefined;
export default api(async event => {
  const action = event.url.pathname.split('/').pop();
  if (event.req.method === 'GET' && action === 'session') {
    return { actor: await authenticate(getCookie(event, 'pvedc_session')), initialized: initialized(), title: getSettings().title };
  }
  ensure(event.req.method === 'POST', 405, '请求方法不支持');
  if (action === 'admin') {
    rateLimit('admin-account');
    rateLimit('admin:' + clientIp(event));
    const { code } = await body(event, z.object({ code: otp }));
    checkAdminOtp(code);
    const session = await issueSession('admin', 'admin');
    sessionCookie(event, session.token);
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
    sessionCookie(event, session.token);
    audit(input.studentId, 'login');
    return { actor: session.actor, expiresAt: session.expiresAt };
  }
  const user = await actor(event);
  if (action === 'logout') {
    getDb().prepare('DELETE FROM sessions WHERE id=?').run(user.sessionId);
    sessionCookie(event, '', 0);
    return { ok: true };
  }
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
    sessionCookie(event, session.token);
    return { ok: true };
  }
  ensure(false, 404, '接口不存在');
});
