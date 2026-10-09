import { randomUUID } from 'node:crypto';
import { getCookie, setCookie } from 'nitro/h3';
import { z } from 'zod';
import { otp } from '../../../shared/schema';
import { api, body, clientIp, cookieSecurity, sessionCookie } from '../../lib/http';
import { beginSetup, finishSetup, initialized, issueSession, rateLimit } from '../../lib/auth';
import { ensure } from '../../lib/errors';

export default api(async event => {
  const action = event.url.pathname.split('/').pop();
  if (event.req.method === 'GET' && action === 'status') return { initialized: initialized() };
  ensure(event.req.method === 'POST', 405, '请求方法不支持');
  rateLimit('setup:' + clientIp(event), 20);
  const owner = getCookie(event, 'pvedc_setup') || randomUUID();
  if (action === 'begin') {
    const result = await beginSetup(owner);
    setCookie(event, 'pvedc_setup', owner, { ...cookieSecurity(event), path: '/api/setup', maxAge: 600 });
    return result;
  }
  if (action === 'complete') {
    const { code } = await body(event, z.object({ code: otp }));
    finishSetup(owner, code);
    const session = await issueSession('admin', 'admin');
    sessionCookie(event, session.token);
    return { actor: session.actor, expiresAt: session.expiresAt };
  }
  ensure(false, 404, '接口不存在');
});
