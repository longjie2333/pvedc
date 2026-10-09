import { getDb, now, audit } from './db';
import type { FullJobRow } from './records';
import type { Actor } from '../../shared/schema';
import { taskNames } from '../../shared/activity';
import { containerExists, guestConfig, nodePath, ownershipTag, pve, taskStatus } from './pve';
import { resources } from './records';
import { AppError, ensure } from './errors';

export async function retryTask(user: Actor, id: string) {
  const job = getDb().prepare('SELECT * FROM jobs WHERE id=?').get(id) as FullJobRow | undefined;
  ensure(job && (user.role === 'admin' || user.sub === job.student_id), 404, '任务不存在');
  ensure(Object.hasOwn(taskNames, job.type), 409, '此历史任务类型已不支持，仅保留记录');
  ensure(['failed', 'attention'].includes(job.state), 409, '任务当前不能重试');
  let step = job.step, upid = job.upid;
  const resource = resources().find(r => r.id === job.resource_id);
  if (!upid && resource && ['create-wait', 'delete-wait', 'start-wait', 'stop-wait', 'power-wait'].includes(step)) {
    const types: Record<string, string> = { 'create-wait': 'vzcreate', 'delete-wait': 'vzdestroy', 'start-wait': 'vzstart', 'stop-wait': 'vzstop', 'power-wait': { start: 'vzstart', shutdown: 'vzshutdown', reboot: 'vzreboot' }[job.type] || '' };
    const recent = await pve<{ upid: string; type: string; starttime: number }[]>(nodePath() + '/tasks', 'GET', { vmid: resource.vmid, source: 'all', limit: 50 });
    upid = recent.filter(task => task.type === types[step] && task.starttime >= job.created_at).sort((a, b) => b.starttime - a.starttime)[0]?.upid || null;
    if (!upid) {
      const exists = await containerExists(resource.vmid);
      if (step === 'create-wait' && !exists) step = 'create';
      if (step === 'delete-wait' && exists) {
        const config = await guestConfig(resource.vmid);
        ensure(String(config.tags || '').split(';').includes(ownershipTag()) && !config.lock, 409, '容器所有权或锁状态不允许重试删除');
        step = 'delete';
      }
    }
  }
  if (upid) {
    const status = await taskStatus(upid);
    if (status.status === 'stopped' && !status.success) {
      const repeat: Record<string, string> = { 'download-wait': 'pending', 'power-wait': 'pending', 'start-wait': 'start', 'stop-wait': 'stop-delete', 'delete-wait': 'delete', 'network-wait': 'pending' };
      if (step === 'create-wait' && resource) {
        if (await containerExists(resource.vmid)) {
          const config = await guestConfig(resource.vmid);
          ensure(String(config.tags || '').split(';').includes(ownershipTag()), 409, 'VMID 被其他资源占用，需要管理员处理');
          ensure(!config.lock, 409, '失败容器仍被 PVE 锁定，请在 PVE 检查并解除失效锁');
          step = 'stop-delete';
        } else step = 'create';
      } else step = repeat[step] || step;
      upid = null;
    }
  }
  getDb().prepare('UPDATE jobs SET state=?,error=NULL,step=?,upid=?,updated_at=? WHERE id=?').run('queued', step, upid, now(), id);
  audit(user.sub, 'task.retry', id);
  return { taskId: id };
}
export function cancelNetworkTask(user: Actor, id: string) {
  ensure(user.role === 'admin', 403, '仅管理员可取消网络任务');
  const job = getDb().prepare('SELECT * FROM jobs WHERE id=?').get(id) as FullJobRow | undefined;
  ensure(job && ['network-apply', 'network-remove'].includes(job.type), 404, '网络任务不存在');
  const payload = JSON.parse(job.payload) as { networkId: string; sdnLock?: string; networkWasReady?: number };
  ensure(!payload.sdnLock, 409, '网络操作结果尚需核对，请先重试以完成恢复');
  getDb().transaction(() => {
    const changed = getDb().prepare("UPDATE jobs SET state='failed',error='管理员取消了网络任务',updated_at=? WHERE id=? AND state IN ('queued','attention')").run(now(), id);
    ensure(changed.changes === 1, 409, '只能取消排队中或待处理的网络任务');
    getDb().prepare('UPDATE networks SET ready=COALESCE(?,ready),error=NULL WHERE id=?').run(payload.networkWasReady ?? null, payload.networkId);
    audit(user.sub, 'task.cancel', id);
  }).immediate();
  return { ok: true };
}
