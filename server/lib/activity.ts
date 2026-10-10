import type { Actor, Task } from '../../shared/schema';
import { activityQuerySchema, type ActivityQuery, type AuditRecord, type PageResult } from '../../shared/activity';
import { getDb } from './db';
import { taskView } from './records';

function readPage<T>(table: string, fields: string, order: string, clauses: string[], values: (string | number)[], query: ActivityQuery): PageResult<T> {
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  return getDb().transaction(() => {
    const total = (getDb().prepare('SELECT COUNT(*) total FROM ' + table + where).get(...values) as { total: number }).total;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
    const items = getDb().prepare('SELECT ' + fields + ' FROM ' + table + where + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?')
      .all(...values, query.pageSize, (page - 1) * query.pageSize) as T[];
    return { items, total, page, pageSize: query.pageSize };
  })();
}

export function taskPage(input: unknown, actor: Actor): PageResult<Task> {
  const query = activityQuerySchema.parse(input), clauses: string[] = [], values: (string | number)[] = [];
  const filters = { [actor.role === 'student' ? 'j.student_id' : "COALESCE(j.student_id,json_extract(j.payload,'$.studentId'))"]: actor.role === 'student' ? actor.sub : query.studentId, 'j.type': query.type, 'j.state': query.state };
  for (const [column, value] of Object.entries(filters)) if (value) { clauses.push(column + '=?'); values.push(value); }
  if (query.q) {
    clauses.push("instr(lower(j.id||' '||j.type||' '||COALESCE(j.student_id,json_extract(j.payload,'$.studentId'),'')||' '||COALESCE(s.name,json_extract(j.payload,'$.studentName'),'')||' '||COALESCE(j.resource_id,'')||' '||COALESCE(j.error,'')),lower(?))>0");
    values.push(query.q);
  }
  if (query.from !== undefined) { clauses.push('j.created_at>=?'); values.push(query.from); }
  if (query.to !== undefined) { clauses.push('j.created_at<=?'); values.push(query.to); }
  const result = readPage<Parameters<typeof taskView>[0]>(
    'jobs j LEFT JOIN students s ON s.id=j.student_id',
    "j.id,j.type,j.student_id,json_extract(j.payload,'$.studentId') deleted_student_id,j.resource_id,j.state,j.step,j.error,j.created_at,j.updated_at",
    'j.created_at DESC,j.id DESC', clauses, values, query,
  );
  return { ...result, items: result.items.map(taskView) };
}

export function auditPage(input: unknown): PageResult<AuditRecord> {
  const query = activityQuerySchema.parse(input), clauses: string[] = [], values: (string | number)[] = [];
  for (const [column, value] of Object.entries({ actor: query.actor, action: query.action })) if (value) { clauses.push(column + '=?'); values.push(value); }
  if (query.q) { clauses.push("instr(lower(actor||' '||action||' '||COALESCE(target,'')||' '||COALESCE(detail,'')),lower(?))>0"); values.push(query.q); }
  if (query.from !== undefined) { clauses.push('created_at>=?'); values.push(query.from); }
  if (query.to !== undefined) { clauses.push('created_at<=?'); values.push(query.to); }
  return readPage('audit', 'id,actor,action,target,detail,created_at', 'created_at DESC,id DESC', clauses, values, query);
}
