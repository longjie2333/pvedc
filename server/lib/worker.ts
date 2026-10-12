import { getDb, now, audit } from './db';
import { resources, forwards, type FullJobRow } from './records';
import { containerExists, containerPath, guestConfig, nodePath, ownershipTag, pve, taskStatus, type ContainerStatus } from './pve';
import { AppError, ensure } from './errors';
import { unseal } from './crypto';
import { helper } from './helper';
import { hashPassword } from './auth';
import { revokeSubject } from './sessions';
import { configureGost, refreshForwardStatus, syncForwards, gostApiUpdating } from './gost';
import { applyNetwork, removeNetwork } from './network';
import { removeCatalog } from './catalog';
import { checkpoint, succeed } from './job-state';
import { updateGostApi } from './gost-api';
import { configKey, netConfig, recordAssignedMacs } from './machine-network';
import { enqueue } from './provision';

async function submit(job: FullJobRow, step: string, path: string, method: string, params?: Record<string, unknown>) {
  checkpoint(job, step);
  const upid = await pve<string>(path, method, params);
  checkpoint(job, step, upid);
}
export async function runJob(job: FullJobRow) {
  if (job.type === 'gost-api-update') { await updateGostApi(job); return; }
  const payload = JSON.parse(job.payload) as Record<string, string>;
  if (job.type === 'network-apply' || job.type === 'network-remove') {
    try {
      if (job.step === 'pending') {
        getDb().prepare("UPDATE jobs SET payload=json_set(payload,'$.networkWasReady',COALESCE(json_extract(payload,'$.networkWasReady'),(SELECT ready FROM networks WHERE id=?))) WHERE id=?").run(payload.networkId, job.id);
        getDb().prepare('UPDATE networks SET ready=0 WHERE id=?').run(payload.networkId);
        const upid = await (job.type === 'network-apply' ? applyNetwork : removeNetwork)(payload.networkId, job.id);
        if (upid) { checkpoint(job, 'network-wait', upid); return; }
      } else {
        ensure(job.upid, 409, '网络应用结果未知，请检查 PVE SDN 任务');
        const status = await taskStatus(job.upid);
        if (status.status !== 'stopped') return;
        ensure(status.success, 502, 'PVE 网络应用失败，请检查 SDN 任务');
      }
      getDb().prepare('UPDATE networks SET ready=?,error=NULL WHERE id=?').run(job.type === 'network-apply' ? 1 : 0, payload.networkId);
    }
    catch (error) { getDb().prepare("UPDATE networks SET ready=COALESCE((SELECT json_extract(payload,'$.networkWasReady') FROM jobs WHERE id=?),0),error=? WHERE id=?").run(job.id, error instanceof Error ? error.message : '应用失败', payload.networkId); throw error; }
    succeed(job); return;
  }
  if (job.type === 'gost-configure') { await configureGost(); await syncForwards(); succeed(job); return; }
  if (job.type === 'template-download') {
    if (job.step === 'pending') { await submit(job, 'download-wait', nodePath() + '/aplinfo', 'POST', { template: payload.template, storage: payload.storage }); return; }
    ensure(job.upid, 409, '下载请求结果未知，请检查 PVE 任务后重试');
    const state = await taskStatus(job.upid);
    if (state.status !== 'stopped') return;
    ensure(state.success, 502, '模板下载失败，请检查 PVE 下载任务'); succeed(job); return;
  }
  if (job.type === 'student-delete' && !job.resource_id) {
    getDb().transaction(() => { removeCatalog('students', job.student_id || payload.studentId); succeed(job); }).immediate();
    return;
  }
  const reclaiming = job.type === 'reclaim' || job.type === 'student-delete';
  const resource = resources().find(r => r.id === job.resource_id);
  ensure(resource, 409, '任务资源不存在');
  const path = containerPath(resource.vmid);
  if (job.type === 'forward-sync') {
    await syncForwards(resource.id);
    if (payload.deleteId) getDb().prepare('DELETE FROM forwards WHERE id=? AND resource_id=?').run(payload.deleteId, resource.id);
    succeed(job); return;
  }

  if (job.type === 'password') {
    const config = await guestConfig(resource.vmid);
    ensure(String(config.tags || '').split(';').includes(ownershipTag()), 409, '容器所有权不匹配');
    ensure(job.secret, 409, '改密任务缺少凭据');
    const password = unseal(job.secret);
    await helper({ operation: 'password', vmid: resource.vmid, password });
    const hash = await hashPassword(password);
    getDb().transaction(() => {
      getDb().prepare('UPDATE students SET password_hash=? WHERE id=?').run(hash, resource.studentId);
      revokeSubject(resource.studentId); succeed(job);
    }).immediate(); return;
  }

  if (['start', 'shutdown', 'reboot'].includes(job.type)) {
    const config = await guestConfig(resource.vmid);
    ensure(String(config.tags || '').split(';').includes(ownershipTag()), 409, '容器所有权不匹配');
    if (job.step === 'pending') { await submit(job, 'power-wait', path + '/status/' + job.type, 'POST'); return; }
    if (job.upid) {
      const state = await taskStatus(job.upid);
      if (state.status !== 'stopped') return;
      ensure(state.success, 502, '电源操作失败，请检查 PVE 任务');
    } else {
      const state = await pve<ContainerStatus>(path + '/status/current');
      ensure(job.type !== 'reboot' && state.status === (job.type === 'shutdown' ? 'stopped' : 'running'), 409, '电源操作结果未知，请核对 PVE 状态');
    }
    succeed(job); return;
  }

  if (job.step === 'pending') {
    if (job.type === 'create') checkpoint(job, 'create');
    if (job.type === 'rebuild' || reclaiming) {
      if (reclaiming && !await containerExists(resource.vmid)) {
        const active = await pve<unknown[]>(nodePath() + '/tasks', 'GET', { vmid: resource.vmid, source: 'active' });
        ensure(!active.length, 409, 'PVE 仍有此 VMID 的活动任务，请等待完成');
        if (forwards(resource.studentId).length) await syncForwards(resource.id, true);
        getDb().prepare('UPDATE resources SET state=? WHERE id=?').run('deleting', resource.id);
        checkpoint(job, 'delete-wait'); return;
      }
      const config = await guestConfig(resource.vmid);
      ensure(String(config.tags || '').split(';').includes(ownershipTag()), 409, '容器所有权不匹配，禁止删除');
      if (job.type === 'rebuild') {
        const [storage, file] = resource.spec.template.split(':');
        const templates = await pve<{ volid: string }[]>(nodePath() + '/storage/' + storage + '/content', 'GET', { content: 'vztmpl' });
        ensure(templates.some(t => t.volid === storage + ':' + file), 409, '原系统模板已缺失，重建未执行');
        await pve(nodePath() + '/storage/' + resource.spec.storage + '/status');
      }
      if (forwards(resource.studentId).length) await syncForwards(resource.id, true);
      getDb().prepare('UPDATE resources SET state=? WHERE id=?').run(job.type === 'rebuild' ? 'rebuilding' : 'deleting', resource.id);
      checkpoint(job, 'stop-delete');
    }
    return;
  }
  if (job.step === 'stop-delete') {
    const state = await pve<ContainerStatus>(path + '/status/current');
    if (state.status === 'running') { await submit(job, 'stop-wait', path + '/status/stop', 'POST'); return; }
    checkpoint(job, 'delete'); return;
  }
  if (job.step === 'stop-wait') {
    if (job.upid) { const state = await taskStatus(job.upid); if (state.status !== 'stopped') return; ensure(state.success, 502, '停止容器失败'); }
    else ensure((await pve<ContainerStatus>(path + '/status/current')).status === 'stopped', 409, '停止操作结果未知');
    checkpoint(job, 'delete'); return;
  }
  if (job.step === 'delete') {
    const config = await guestConfig(resource.vmid);
    ensure(String(config.tags || '').split(';').includes(ownershipTag()), 409, '容器所有权不匹配，禁止删除');
    await submit(job, 'delete-wait', path, 'DELETE', { purge: 1 }); return;
  }
  if (job.step === 'delete-wait') {
    if (job.upid) { const state = await taskStatus(job.upid); if (state.status !== 'stopped') return; ensure(state.success, 502, '删除容器失败'); }
    if (await containerExists(resource.vmid)) {
      const config = await guestConfig(resource.vmid);
      ensure(String(config.tags || '').split(';').includes(ownershipTag()), 409, 'VMID 已被其他资源使用，请核对删除结果');
      ensure(job.upid, 409, '删除请求结果未知，容器仍然存在，请重试任务');
      return;
    }
    if (reclaiming) {
      getDb().transaction(() => {
        getDb().prepare('DELETE FROM forwards WHERE resource_id=?').run(resource.id);
        getDb().prepare('DELETE FROM resources WHERE id=?').run(resource.id);
        if (job.type === 'student-delete') removeCatalog('students', resource.studentId);
        succeed(job);
      }).immediate(); return;
    }
    checkpoint(job, 'create'); return;
  }
  if (job.step === 'create') {
    ensure(job.secret, 409, '创建任务缺少密码');
    const s = resource.spec, primary = resource.networks[0];
    const interfaces = Object.fromEntries(resource.networks.map(entry => [configKey(entry.iface), netConfig(entry)]));
    getDb().prepare('UPDATE resources SET state=? WHERE id=?').run('creating', resource.id);
    await submit(job, 'create-wait', nodePath() + '/lxc', 'POST', {
      vmid: resource.vmid, hostname: resource.studentId, ostemplate: s.template, cores: s.cores, memory: s.memory, swap: s.swap,
      rootfs: s.storage + ':' + s.disk, ...interfaces, ...(primary.dns.length ? { nameserver: primary.dns.join(' ') } : {}),
      password: unseal(job.secret), unprivileged: 1, features: s.nesting ? 'nesting=1' : undefined, onboot: 1, start: 0,
      tags: ownershipTag(), description: 'PVE Distribution Center / ' + resource.id,
    }); return;
  }
  if (job.step === 'create-wait') {
    if (job.upid) { const state = await taskStatus(job.upid); if (state.status !== 'stopped') return; ensure(state.success, 502, 'PVE 创建失败，资源预留已保留，等待处理'); }
    const config = await guestConfig(resource.vmid);
    ensure(String(config.tags || '').split(';').includes(ownershipTag()), 409, 'VMID 被其他资源占用');
    if (config.lock) return;
    recordAssignedMacs(resource, config);
    checkpoint(job, 'start'); return;
  }
  if (job.step === 'start') { await submit(job, 'start-wait', path + '/status/start', 'POST'); return; }
  if (job.step === 'start-wait') {
    if (job.upid) { const state = await taskStatus(job.upid); if (state.status !== 'stopped') return; ensure(state.success, 502, '容器启动失败'); }
    else ensure((await pve<ContainerStatus>(path + '/status/current')).status === 'running', 409, '启动操作结果未知');
    checkpoint(job, 'bootstrap'); return;
  }
  if (job.step === 'bootstrap') {
    getDb().prepare('UPDATE resources SET state=? WHERE id=?').run('configuring', resource.id);
    await helper({ operation: 'bootstrap', vmid: resource.vmid });
    checkpoint(job, 'finish'); return;
  }
  if (job.step === 'finish') {
    if (job.type === 'rebuild' && job.secret) {
      const hash = await hashPassword(unseal(job.secret));
      getDb().prepare('UPDATE students SET password_hash=? WHERE id=?').run(hash, resource.studentId);
      revokeSubject(resource.studentId);
    }
    getDb().prepare('UPDATE resources SET state=? WHERE id=?').run('ready', resource.id);
    const hasForwards = forwards(resource.studentId).some(rule => rule.resourceId === resource.id);
    succeed(job);
    if (hasForwards) enqueue('forward-sync', resource.studentId, resource.id, {});
    return;
  }
  throw new AppError(409, '无法识别的任务阶段');
}

let busy = false;
export async function workerTick() {
  if (busy) return;
  busy = true;
  try {
    const job = getDb().prepare('SELECT * FROM jobs WHERE state IN (?,?) ORDER BY created_at LIMIT 1').get('queued', 'running') as FullJobRow | undefined;
    if (!job) return;
    getDb().prepare('UPDATE jobs SET state=?,updated_at=? WHERE id=?').run('running', now(), job.id);
    try { await runJob(job); }
    catch (error) {
      const message = error instanceof AppError ? error.message : '任务执行失败，请检查部署环境';
      if (!(error instanceof AppError)) console.error('[task]', { id: job.id, type: job.type, step: job.step, name: error instanceof Error ? error.name : 'Unknown', code: (error as NodeJS.ErrnoException)?.code, frames: error instanceof Error ? error.stack?.split('\n').slice(1, 5) : undefined });
      getDb().prepare('UPDATE jobs SET state=?,error=?,updated_at=? WHERE id=?').run('attention', message, now(), job.id);
      audit('system', 'task.attention', job.id, message);
    }
  } finally { busy = false; }
}
export function startWorker() {
  const timer = setInterval(() => void workerTick(), 2000);
  timer.unref();
  let checking = false;
  const statusTimer = setInterval(async () => {
    if (checking || gostApiUpdating() || !forwards().length) return;
    checking = true;
    try { await refreshForwardStatus(); } catch { getDb().prepare('UPDATE forwards SET state=?,error=? WHERE enabled=1').run('unknown', '暂时无法读取 gost 状态'); }
    finally { checking = false; }
  }, 15000);
  statusTimer.unref();
  const reconcile = async () => {
    if (busy || gostApiUpdating() || !forwards().length) return;
    busy = true;
    try { await syncForwards(); } catch { /* Keep desired state and retry without discarding leases. */ }
    finally { busy = false; }
  };
  const initialSync = setTimeout(() => void reconcile(), 3000);
  const reconciliation = setInterval(() => void reconcile(), 60000);
  initialSync.unref(); reconciliation.unref();
  return () => { clearInterval(timer); clearInterval(statusTimer); clearInterval(reconciliation); clearTimeout(initialSync); };
}
