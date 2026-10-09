import { z } from 'zod';
import { api, body, clientIp, sessionCookie } from '../../lib/http';
import { ensure } from '../../lib/errors';
import { initialized, issueSession, rateLimit } from '../../lib/auth';
import { getSettings } from '../../lib/settings';
import { students, profiles } from '../../lib/records';
import { password, studentId } from '../../../shared/schema';
import { allocate } from '../../lib/provision';

export default api(async event => {
  const action = event.url.pathname.split('/').pop();
  const settings = getSettings();
  ensure(initialized(), 403, '平台尚未初始化');
  if (event.req.method === 'GET' && action === 'roster') {
    rateLimit('roster:' + clientIp(event), 120, 60);
    const query = (event.url.searchParams.get('q') || '').trim();
    return { open: settings.registrationOpen, selfSelection: settings.selfSelection,
      students: settings.registrationOpen ? students().filter(s => s.enabled && !s.claimed && (!query || s.id.includes(query) || s.name.includes(query))).slice(0, 100).map(s => ({ id: s.id, name: s.name, className: s.className, assigned: !!s.profileId })) : [],
      profiles: profiles().filter(p => p.enabled && p.published).map(p => ({ id: p.id, name: p.name, cores: p.cores, memory: p.memory, disk: p.disk, distro: p.distro })), defaultProfileId: settings.defaultProfileId,
    };
  }
  if (event.req.method === 'POST' && action === 'claim') {
    rateLimit('claim:' + clientIp(event), 60);
    const input = await body(event, z.object({ studentId, password, profileId: z.string().optional() }));
    const result = await allocate(input.studentId, input.password, input.profileId, true);
    const session = await issueSession('student', input.studentId);
    sessionCookie(event, session.token);
    return { ...result, actor: session.actor };
  }
  ensure(false, 404, '接口不存在');
});
