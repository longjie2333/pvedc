import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from '../../shared/schema';
import { batchConfirmation, batchSchema, type BatchResult, type BatchStatus } from '../../shared/batch';
import { audit, getDb } from './db';
import { AppError, ensure } from './errors';
import { enqueue, resourceAction } from './provision';
import { revokeSubject } from './sessions';
import { studentDeleting } from './records';

export async function studentBatch(actor: Actor, input: unknown): Promise<BatchResult> {
  ensure(actor.role === 'admin', 403, '仅管理员可批量操作');
  const { ids, action, confirmation } = batchSchema.parse(input);
  const expected = batchConfirmation(action, ids.length);
  ensure(!expected || confirmation === expected, 400, '请输入确认文字：' + expected);
  const batchId = randomUUID(), items: BatchResult['items'] = [];
  for (const id of ids) {
    try {
      const student = getDb().prepare('SELECT id,name,class_name FROM students WHERE id=?').get(id) as { id: string; name: string; class_name: string } | undefined;
      ensure(student, 404, '学生不存在');
      ensure(!studentDeleting(id), 409, '该学生已有删除任务，请处理原任务');
      const resource = getDb().prepare('SELECT id FROM resources WHERE student_id=?').get(id) as { id: string } | undefined;
      if (!resource && action !== 'delete') { items.push({ studentId: id, status: 'skipped', message: '尚未分配机器' }); continue; }
      const task = resource ? await resourceAction(actor, resource.id, action === 'delete' ? 'student-delete' : action, { confirmation: id })
        : getDb().transaction(() => {
          const job = enqueue('student-delete', id, null, { studentId: id, studentName: student.name, studentClassName: student.class_name });
          getDb().prepare('UPDATE students SET enabled=0 WHERE id=?').run(id);
          revokeSubject(id);
          return job;
        }).immediate();
      getDb().prepare("UPDATE jobs SET payload=json_set(payload,'$.batchId',?) WHERE id=?").run(batchId, task.taskId);
      items.push({ studentId: id, status: 'queued', taskId: task.taskId });
    } catch (error) {
      items.push({ studentId: id, status: 'failed', message: error instanceof AppError ? error.message : '任务未受理，请刷新后重试' });
    }
  }
  audit(actor.sub, 'students.batch.' + action, batchId, JSON.stringify({ requested: ids.length, queued: items.filter(item => item.status === 'queued').length }));
  return { batchId, action, items };
}

export function batchStatus(id: string): BatchStatus {
  z.uuid().parse(id);
  const rows = getDb().prepare("SELECT state,COUNT(*) count FROM jobs WHERE json_extract(payload,'$.batchId')=? GROUP BY state").all(id) as { state: keyof Omit<BatchStatus, 'total'>; count: number }[];
  const result: BatchStatus = { total: 0, succeeded: 0, failed: 0, attention: 0, queued: 0, running: 0 };
  for (const row of rows) { result[row.state] = row.count; result.total += row.count; }
  ensure(result.total, 404, '批量任务不存在');
  return result;
}
