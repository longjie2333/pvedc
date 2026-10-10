import { randomUUID } from 'node:crypto';
import type { Actor, ForwardInput, Profile } from '../../shared/schema';
import { getDb, now, audit } from './db';
import { ensure } from './errors';
import { seal } from './crypto';
import { hashPassword, verifyPassword } from './auth';
import { revokeSubject } from './sessions';
import { getSettings } from './settings';
import { forwards, profiles, resources, type StudentRow } from './records';
import { selectProfile } from './allocation';
import { budgetFor, inventory } from './inventory';
import { containerExists, containerPath, guestConfig, nodePath, ownershipTag, pve, type ContainerStatus } from './pve';

function reserveInitialForwards(resourceId: string, studentId: string, profile: Profile) {
  const initialForwards = profile.initialForwards || [];
  if (!initialForwards.length) return;
  const settings = getSettings(), existing = forwards();
  ensure(initialForwards.length <= settings.forwardQuota, 409, '初始化转发数量超过每人配额');
  const used = new Set(existing.map(rule => rule.protocol + ':' + rule.publicPort));
  for (const input of initialForwards) {
    let publicPort = input.publicPort ?? settings.portStart;
    if (!input.publicPort) while (publicPort <= settings.portEnd && (used.has(input.protocol + ':' + publicPort) || settings.reservedPorts.includes(publicPort) || publicPort === settings.webTunnelPort)) publicPort++;
    ensure(publicPort >= settings.portStart && publicPort <= settings.portEnd, 409, '初始化转发没有可用公网端口');
    ensure(!used.has(input.protocol + ':' + publicPort) && !settings.reservedPorts.includes(publicPort) && publicPort !== settings.webTunnelPort, 409, '初始化转发公网端口已占用');
    used.add(input.protocol + ':' + publicPort);
    getDb().prepare('INSERT INTO forwards(id,student_id,resource_id,protocol,public_port,target_port,note,state) VALUES(?,?,?,?,?,?,?,?)')
      .run(randomUUID(), studentId, resourceId, input.protocol, publicPort, input.targetPort, input.note, 'pending');
  }
}

export function enqueue(type: string, studentId: string | null, resourceId: string | null, payload: Record<string, unknown>, secret?: string) {
  const existing = resourceId ? getDb().prepare('SELECT id FROM jobs WHERE resource_id=? AND state IN (?,?,?)').get(resourceId, 'queued', 'running', 'attention') as { id: string } | undefined : undefined;
  ensure(!existing, 409, '该资源已有进行中或待处理的任务');
  const id = randomUUID();
  getDb().prepare('INSERT INTO jobs(id,type,student_id,resource_id,state,step,payload,secret,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id, type, studentId, resourceId, 'queued', 'pending', JSON.stringify(payload), secret ? seal(secret) : null, now(), now());
  return { taskId: id };
}

export async function allocate(studentId: string, password: string, selected?: string, claim = false) {
  const settings = getSettings();
  ensure(settings.registrationOpen, 403, '管理员尚未开放资源申请');
  const student = getDb().prepare('SELECT * FROM students WHERE id=?').get(studentId) as StudentRow | undefined;
  ensure(student?.enabled, 404, '学号不存在或已停用');
  if (claim) ensure(!student.password_hash, 409, '该学号已经认领，请登录');
  else ensure(student.password_hash && await verifyPassword(student.password_hash, password), 401, '密码错误');
  const previous = resources().find(r => r.studentId === studentId);
  if (previous) {
    const job = getDb().prepare('SELECT id FROM jobs WHERE resource_id=? ORDER BY created_at DESC LIMIT 1').get(previous.id) as { id: string };
    return { taskId: job.id };
  }
  const snapshot = await inventory();
  const hash = claim ? await hashPassword(password) : student.password_hash;
  return getDb().transaction(() => {
    ensure(getSettings().registrationOpen, 403, '管理员已关闭资源申请');
    const current = getDb().prepare('SELECT * FROM students WHERE id=?').get(studentId) as StudentRow;
    ensure(current.enabled && (!claim || !current.password_hash), 409, '该学号已经认领或停用');
    const profile = selectProfile(profiles(), current.profile_id, selected, getSettings());
    const allocation = budgetFor(profile, snapshot);
    ensure(allocation.capacity.count > 0, 409, '当前配置容量不足：' + allocation.capacity.limiting.join('、'));
    const id = randomUUID();
    getDb().prepare('INSERT INTO resources(id,student_id,vmid,profile_id,network_id,ip,spec,network,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, studentId, allocation.vmid, profile.id, profile.networkId, allocation.ip, JSON.stringify(profile), JSON.stringify(allocation.network), 'reserved', now());
    reserveInitialForwards(id, studentId, profile);
    if (claim) getDb().prepare('UPDATE students SET password_hash=? WHERE id=?').run(hash, studentId);
    const job = enqueue('create', studentId, id, {}, password);
    audit(studentId, 'resource.allocate', id);
    return job;
  }).immediate();
}

export async function resourceAction(user: Actor, id: string, action: string, input: { password?: string; newPassword?: string; confirmation?: string }) {
  const reclaiming = action === 'reclaim' || action === 'student-delete';
  const resource = resources().find(r => r.id === id);
  ensure(resource && (user.role === 'admin' || resource.studentId === user.sub), 404, '资源不存在');
  ensure(['start', 'shutdown', 'reboot', 'rebuild', 'password', 'reclaim', 'student-delete'].includes(action), 400, '不支持的操作');
  ensure(!reclaiming || user.role === 'admin', 403, '仅管理员可回收资源');
  if (action === 'rebuild' || reclaiming) ensure(input.confirmation === resource.studentId, 400, '请输入学号以确认清空数据');
  if (['password', 'rebuild'].includes(action) && user.role !== 'admin') {
    const row = getDb().prepare('SELECT password_hash FROM students WHERE id=?').get(user.sub) as { password_hash: string };
    ensure(input.password && await verifyPassword(row.password_hash, input.password), 401, '当前密码不正确');
  }
  if (action === 'password') {
    ensure(input.newPassword, 400, '请输入新密码');
    const state = await pve<ContainerStatus>(containerPath(resource.vmid) + '/status/current');
    ensure(state.status === 'running', 409, '请先启动容器再修改密码');
  }
  if (action === 'rebuild') ensure(input.newPassword || input.password, 400, '请输入重建后的密码');
  const active = getDb().prepare("SELECT id,state,step,upid FROM jobs WHERE resource_id=? AND state IN ('queued','running','attention')").get(id) as { id: string; state: string; step: string; upid: string | null } | undefined;
  if (active && reclaiming) {
    ensure(active.state === 'attention', 409, '请等待正在执行的任务完成');
    ensure(active.step !== 'create-wait' || active.upid, 409, '创建请求结果未知，请先重试任务以核对 PVE 状态');
    const running = await pve<unknown[]>(nodePath() + '/tasks', 'GET', { vmid: resource.vmid, source: 'active' });
    ensure(!running.length, 409, 'PVE 中仍有活动任务，暂不能回收');
    if (await containerExists(resource.vmid)) {
      const config = await guestConfig(resource.vmid);
      ensure(String(config.tags || '').split(';').includes(ownershipTag()) && !config.lock, 409, '容器所有权或锁状态不允许回收');
    }
  }
  const result = getDb().transaction(() => {
    if (active && reclaiming) {
      const changed = getDb().prepare("UPDATE jobs SET state='failed',error='管理员已转入资源回收',secret=NULL,updated_at=? WHERE id=? AND state='attention'").run(now(), active.id);
      ensure(changed.changes === 1, 409, '任务状态已变化，请刷新重试');
    }
    const task = enqueue(action, resource.studentId, id, {}, input.newPassword || input.password);
    if (action === 'student-delete') {
      getDb().prepare('UPDATE students SET enabled=0 WHERE id=?').run(resource.studentId);
      revokeSubject(resource.studentId);
    }
    return task;
  }).immediate();
  audit(user.sub, 'resource.' + action, id);
  return result;
}

export function createForward(user: Actor, resourceId: string, input: ForwardInput) {
  const resource = resources().find(r => r.id === resourceId);
  ensure(resource && (user.role === 'admin' || resource.studentId === user.sub), 404, '资源不存在');
  ensure(resource.state === 'ready', 409, '资源尚未就绪');
  const settings = getSettings();
  ensure(settings.relayHost && settings.gostPassword, 409, '管理员尚未配置公网转发');
  return getDb().transaction(() => {
    const rules = forwards();
    ensure(rules.filter(f => f.studentId === resource.studentId).length < settings.forwardQuota, 409, '已达到转发数量上限');
    const occupied = new Set([...rules.filter(f => f.protocol === input.protocol).map(f => f.publicPort), ...settings.reservedPorts, settings.webTunnelPort]);
    let port = input.publicPort ?? settings.portStart;
    if (!input.publicPort) while (port <= settings.portEnd && occupied.has(port)) port++;
    ensure(port >= settings.portStart && port <= settings.portEnd && !occupied.has(port), 409, '公网端口不可用');
    const id = randomUUID();
    getDb().prepare('INSERT INTO forwards(id,student_id,resource_id,protocol,public_port,target_port,note,state) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, resource.studentId, resource.id, input.protocol, port, input.targetPort, input.note, 'pending');
    const result = enqueue('forward-sync', resource.studentId, resource.id, {});
    audit(user.sub, 'forward.create', id);
    return { ...result, id, publicPort: port };
  }).immediate();
}
export function changeForward(user: Actor, id: string, action: 'enable' | 'disable' | 'delete') {
  const rule = forwards().find(f => f.id === id);
  ensure(rule && (user.role === 'admin' || rule.studentId === user.sub), 404, '转发不存在');
  return getDb().transaction(() => {
    getDb().prepare('UPDATE forwards SET enabled=?,state=? WHERE id=?').run(action === 'enable' ? 1 : 0, action === 'delete' ? 'deleting' : 'pending', id);
    const result = enqueue('forward-sync', rule.studentId, rule.resourceId, { deleteId: action === 'delete' ? id : null });
    audit(user.sub, 'forward.' + action, id);
    return result;
  }).immediate();
}
