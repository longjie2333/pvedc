import { z } from 'zod';
import { api, actor, body } from '../../lib/http';
import { ensure } from '../../lib/errors';
import { forwards, profiles, resources, students, taskForActor } from '../../lib/records';
import { getSettings } from '../../lib/settings';
import { allocate, changeForward, createForward, resourceAction } from '../../lib/provision';
import { forwardSchema, password } from '../../../shared/schema';
import { history, monitor } from '../../lib/monitor';
import { taskPage } from '../../lib/activity';
import { retryTask } from '../../lib/task-recovery';
import { publishedGuideViews } from '../../lib/guides';

export default api(async event => {
  const user = await actor(event, 'student');
  const [, , , action, id, operation] = event.url.pathname.split('/');
  const resource = resources().find(r => r.studentId === user.sub);
  if (event.req.method === 'GET') {
    if (action === 'guides') return { guides: await publishedGuideViews(resource, forwards(user.sub), getSettings().publicHost) };
    if (action === 'tasks') return id ? taskForActor(id, user) : taskPage(Object.fromEntries(event.url.searchParams), user);
    if (action === 'overview') {
      const settings = getSettings();
      return { student: students().find(s => s.id === user.sub), resource, forwards: forwards(user.sub),
        publicHost: settings.publicHost, selfSelection: settings.selfSelection, defaultProfileId: settings.defaultProfileId,
        profiles: profiles().filter(p => p.enabled && p.published).map(p => ({ id: p.id, name: p.name })),
        forwarding: { quota: settings.forwardQuota, portStart: settings.portStart, portEnd: settings.portEnd },
      };
    }
    ensure(resource, 404, '尚未创建资源');
    if (action === 'status') return monitor(resource);
    if (action === 'ports') return monitor(resource, true);
    if (action === 'history') return history(resource);
  }
  ensure(event.req.method === 'POST', 405, '请求方法不支持');
  if (action === 'create') {
    const input = await body(event, z.object({ password, profileId: z.string().optional() }));
    return allocate(user.sub, input.password, input.profileId);
  }
  if (action === 'tasks' && id && operation === 'retry') return retryTask(user, id);
  if (action === 'forwards' && id) {
    ensure(['enable', 'disable', 'delete'].includes(operation), 400, '转发操作无效');
    return changeForward(user, id, operation as 'enable' | 'disable' | 'delete');
  }
  ensure(resource, 404, '尚未创建资源');
  if (action === 'forwards') return createForward(user, resource.id, await body(event, forwardSchema));
  if (action === 'resource' && id) {
    const input = await body(event, z.object({ password: password.optional(), newPassword: password.optional(), confirmation: z.string().optional() }));
    return resourceAction(user, resource.id, id, input);
  }
  ensure(false, 404, '接口不存在');
});
