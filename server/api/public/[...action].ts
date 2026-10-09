import { z } from 'zod';
import { api, body, clientIp, sessionCookie } from '../../lib/http';
import { ensure } from '../../lib/errors';
import { initialized, issueSession, rateLimit } from '../../lib/auth';
import { getSettings } from '../../lib/settings';
import { profiles } from '../../lib/records';
import { password, studentId } from '../../../shared/schema';
import { allocate } from '../../lib/provision';
import { getDb } from '../../lib/db';

export default api(async event => {
  const action = event.url.pathname.split('/').pop();
  const settings = getSettings();
  ensure(initialized(), 403, '平台尚未初始化');
  if (event.req.method === 'GET' && action === 'roster') {
    rateLimit('roster:' + clientIp(event), 120, 60);
    const query = z.string().trim().max(100).parse(event.url.searchParams.get('q') || '');
    const matches = settings.registrationOpen ? getDb().prepare('SELECT id,name,class_name,profile_id FROM students WHERE enabled=1 AND password_hash IS NULL AND (instr(lower(id),lower(?))>0 OR instr(name,?)>0) ORDER BY id LIMIT 100').all(query, query) as { id: string; name: string; class_name: string; profile_id: string | null }[] : [];
    return { open: settings.registrationOpen, selfSelection: settings.selfSelection,
      students: matches.map(s => ({ id: s.id, name: s.name, className: s.class_name, assigned: !!s.profile_id })),
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
