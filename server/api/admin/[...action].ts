import { z } from 'zod';
import { api, actor, body } from '../../lib/http';
import { ensure } from '../../lib/errors';
import { adminStudents, forwards, networks, profiles, resources, students, taskForActor } from '../../lib/records';
import { getSettings, safeSettings, saveSettings } from '../../lib/settings';
import { audit, getDb } from '../../lib/db';
import { exportStudents, importStudents, removeCatalog, resetClaim, saveNetwork, saveProfile, saveStudents, validateSettings } from '../../lib/catalog';
import { forwardSchema, password, profileSchema, settingsSchema, studentSchema } from '../../../shared/schema';
import { changeForward, createForward, enqueue, resourceAction } from '../../lib/provision';
import { allCapacities, inventory } from '../../lib/inventory';
import { nodePath, pve, type PveTemplate } from '../../lib/pve';
import { history, monitor, hostStatus, hostHistory } from '../../lib/monitor';
import { studentBatch, batchStatus } from '../../lib/student-batch';
import { queueGostApi } from '../../lib/gost-api';
import { bridgeOptions, storageOptions, templateOptions, validateProfileOptions, prepareNetwork, networkInputSchema } from '../../lib/pve-options';
import { taskPage, auditPage } from '../../lib/activity';
import { cancelNetworkTask, retryTask } from '../../lib/task-recovery';
import { guides, removeGuide, saveGuide } from '../../lib/guides';

export default api(async event => {
  const user = await actor(event, 'admin');
  const [, , , action, id, operation] = event.url.pathname.split('/');
  if (event.req.method === 'GET') {
    if (action === 'overview') return { students: adminStudents(), resources: resources(), profiles: profiles(), networks: networks(), taskCounts: { attention: (getDb().prepare('SELECT COUNT(*) count FROM jobs WHERE state=?').get('attention') as { count: number }).count }, forwards: forwards() };
    if (action === 'tasks' && id === 'batch') return batchStatus(operation);
    if (action === 'tasks') return id ? taskForActor(id, user) : taskPage(Object.fromEntries(event.url.searchParams), user);
    if (action === 'settings') return safeSettings();
    if (action === 'guides') return id ? guides().find(guide => guide.id === id) || ensure(false, 404, '指导书不存在') : guides();
    if (action === 'gost' && id === 'authorization') {
      const settings = getSettings();
      ensure(settings.gostUser && settings.gostPassword, 409, '请先配置 gost API 用户名和密码');
      return { authorization: 'Basic ' + Buffer.from(settings.gostUser + ':' + settings.gostPassword).toString('base64') };
    }
    if (action === 'capacities') return allCapacities();
    if (action === 'inventory') return inventory();
    if (action === 'host' && id === 'status') return hostStatus();
    if (action === 'host' && id === 'history') return hostHistory();
    if (action === 'options') {
      if (id === 'networks') return bridgeOptions();
      if (id === 'storages') return storageOptions();
      if (id === 'templates') return templateOptions();
      ensure(false, 404, '选项类别不存在');
    }
    if (action === 'audit') return id === 'actions' ? getDb().prepare('SELECT DISTINCT action FROM audit ORDER BY action').all() : auditPage(Object.fromEntries(event.url.searchParams));
    if (action === 'students' && id === 'export') return new Response(exportStudents(), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="students.csv"' } });
    if (action === 'templates') {
      const catalog = (await pve<PveTemplate[]>(nodePath() + '/aplinfo')).filter(t => /^(ubuntu|debian)-.*-standard_.*_amd64\.tar\.(zst|xz|gz)$/.test(t.template));
      const storage = event.url.searchParams.get('storage') || 'local';
      ensure(/^[a-zA-Z0-9_-]+$/.test(storage), 400, '存储名称无效');
      const downloaded = await pve<{ volid: string; size: number }[]>(nodePath() + '/storage/' + storage + '/content', 'GET', { content: 'vztmpl' });
      return { catalog, downloaded };
    }
    if (action === 'resources' && id) {
      const resource = resources().find(r => r.id === id); ensure(resource, 404, '资源不存在');
      if (operation === 'status') return monitor(resource);
      if (operation === 'ports') return monitor(resource, true);
      if (operation === 'history') return history(resource);
    }
  }
  if (event.req.method === 'DELETE' && action === 'guides' && id) {
    ensure(guides().some(guide => guide.id === id), 404, '指导书不存在'); removeGuide(id); audit(user.sub, 'guide.delete', id); return { ok: true };
  }
  if (event.req.method === 'DELETE' && ['profiles', 'networks'].includes(action) && id) {
    removeCatalog(action as 'profiles' | 'networks', id); return { ok: true };
  }
  ensure(['POST', 'PUT'].includes(event.req.method), 405, '请求方法不支持');
  if (action === 'settings') {
    const patch = await body(event, z.record(z.string(), z.unknown()));
    ensure(!['gostApi', 'gostUser', 'gostPassword'].some(key => Object.hasOwn(patch, key)), 400, 'API 地址与凭据请通过保存并同步到宿主机修改');
    const settings = settingsSchema.parse({ ...getSettings(), ...patch });
    validateSettings(settings); saveSettings(settings); audit(user.sub, 'settings.save'); return safeSettings();
  }
  if (action === 'guides') {
    ensure(!id || guides().some(guide => guide.id === id), 404, '指导书不存在');
    const guide = saveGuide(await body(event, z.record(z.string(), z.unknown())), id); audit(user.sub, id ? 'guide.update' : 'guide.create', guide.id); return guide;
  }
  if (action === 'students') {
    if (id === 'batch') return studentBatch(user, await body(event, z.record(z.string(), z.unknown())));
    if (id === 'import') return importStudents((await body(event, z.object({ csv: z.string().max(1500000) }))).csv);
    if (id && operation === 'reset') { resetClaim(id); return { ok: true }; }
    if (id === 'assign') {
      const input = await body(event, z.object({ ids: z.array(z.string()).min(1).max(5000), profileId: z.string().nullable() }));
      return saveStudents(students().filter(s => input.ids.includes(s.id)).map(s => ({ ...s, profileId: input.profileId })));
    }
    return saveStudents([await body(event, studentSchema)]);
  }
  if (action === 'profiles') {
    const profile = await body(event, profileSchema);
    await validateProfileOptions(profile);
    return saveProfile(profile, id);
  }
  if (action === 'networks') {
    if (id && ['apply', 'remove'].includes(operation)) return enqueue(operation === 'apply' ? 'network-apply' : 'network-remove', null, null, { networkId: id });
    return saveNetwork(await prepareNetwork(await body(event, networkInputSchema), id), id);
  }
  if (action === 'templates' && id === 'download') {
    const input = await body(event, z.object({ storage: z.string().regex(/^[a-zA-Z0-9_-]+$/), template: z.string().regex(/^(ubuntu|debian)-[a-zA-Z0-9_.-]+$/) }));
    ensure((await storageOptions()).some(storage => storage.storage === input.storage && storage.content.includes('vztmpl')), 400, '模板存储不可用');
    const catalog = await pve<PveTemplate[]>(nodePath() + '/aplinfo');
    ensure(catalog.some(t => t.template === input.template && /^(ubuntu|debian)-.*-standard_.*_amd64\.tar\.(zst|xz|gz)$/.test(t.template)), 400, '模板不在支持的官方系统目录中');
    return enqueue('template-download', null, null, input);
  }
  if (action === 'gost' && id === 'api') return queueGostApi(await body(event, z.record(z.string(), z.unknown())));
  if (action === 'gost' && id === 'apply') return enqueue('gost-configure', null, null, {});
  if (action === 'tasks' && id && operation === 'retry') return retryTask(user, id);
  if (action === 'tasks' && id && operation === 'cancel') return cancelNetworkTask(user, id);
  if (action === 'resources' && id && operation) return resourceAction(user, id, operation, await body(event, z.object({ password: password.optional(), newPassword: password.optional(), confirmation: z.string().optional() })));
  if (action === 'forwards' && id && operation) {
    ensure(['enable', 'disable', 'delete'].includes(operation), 400, '操作无效');
    return changeForward(user, id, operation as 'enable' | 'disable' | 'delete');
  }
  if (action === 'forwards') {
    const input = await body(event, forwardSchema.extend({ resourceId: z.string() }));
    return createForward(user, input.resourceId, input);
  }
  ensure(false, 404, '接口不存在');
});
