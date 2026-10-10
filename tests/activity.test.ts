import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { getDb, closeDb } from '../server/lib/db';
import { taskPage, auditPage } from '../server/lib/activity';
import type { Actor } from '../shared/schema';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-activity-test-'));
const admin: Actor = { role: 'admin', sub: 'admin', sessionId: 'test' };
beforeAll(() => {
  process.env.PDC_DATA_DIR = directory;
  const db = getDb();
  db.prepare('INSERT INTO students(id,name,created_at) VALUES(?,?,0)').run('a001', '张同学');
  db.prepare('INSERT INTO students(id,name,created_at) VALUES(?,?,0)').run('a002', '李同学');
  const job = db.prepare('INSERT INTO jobs(id,type,student_id,state,step,payload,secret,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const audit = db.prepare('INSERT INTO audit(actor,action,target,created_at) VALUES(?,?,?,?)');
  db.transaction(() => {
    for (let i = 0; i < 65; i++) {
      job.run('job-' + String(i).padStart(3, '0'), i % 2 ? 'start' : 'shutdown', i % 2 ? 'a001' : 'a002', 'succeeded', 'complete', '{"secret":"hidden"}', 'never-expose', 100 + Math.floor(i / 2), 200);
      audit.run(i % 2 ? 'admin' : 'a001', i % 2 ? 'resource.start' : 'resource.shutdown', 'resource-' + i, 100 + i);
    }
  })();
});
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR;
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-activity-test-'))) throw new Error('Unsafe cleanup');
  rmSync(directory, { recursive: true, force: true });
});

it('pages tasks with stable ordering, totals, clamped last page and no secrets', () => {
  const first = taskPage({}, admin), second = taskPage({ page: 2 }, admin);
  expect(first.total).toBe(65); expect(first.items).toHaveLength(20);
  expect(second.items).toHaveLength(20);
  expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(40);
  expect(first.items.slice(0, 3).map(item => item.id)).toEqual(['job-064', 'job-063', 'job-062']);
  expect(JSON.stringify(first)).not.toMatch(/never-expose|hidden|payload|secret/);
  const last = taskPage({ page: 999, pageSize: 50 }, admin);
  expect(last.page).toBe(2); expect(last.items).toHaveLength(15);
});

it('filters tasks and enforces student ownership regardless of requested student ID', () => {
  const results = taskPage({ q: '张同学', type: 'start', state: 'succeeded', from: 110, to: 120 }, admin);
  expect(results.total).toBe(11);
  expect(results.items.every(item => item.studentId === 'a001')).toBe(true);
  expect(taskPage({ q: "' OR 1=1" }, admin).total).toBe(0);
  expect(taskPage({ q: '%' }, admin).total).toBe(0);
  const student: Actor = { role: 'student', sub: 'a001', sessionId: 'test' };
  const scoped = taskPage({ studentId: 'a002', pageSize: 100 }, student);
  expect(scoped.total).toBe(32);
  expect(scoped.items.every(item => item.studentId === 'a001')).toBe(true);
});

it('filters and pages audit rows rather than truncating history', () => {
  expect(auditPage({}).items).toHaveLength(20);
  expect(auditPage({}).total).toBe(65);
  const filtered = auditPage({ actor: 'admin', action: 'resource.start', from: 110, to: 120 });
  expect(filtered.total).toBe(5);
  expect(filtered.items.every(item => item.actor === 'admin')).toBe(true);
  expect(auditPage({ q: 'resource-64' }).items[0].target).toBe('resource-64');
  expect(auditPage({ q: 'no matching record' })).toMatchObject({ items: [], total: 0, page: 1 });
});

it('rejects invalid sizes, page numbers and reversed time ranges', () => {
  for (const input of [{ page: 0 }, { pageSize: 200 }, { state: 'invalid' }, { from: 200, to: 100 }]) {
    expect(() => taskPage(input, admin)).toThrow();
  }
});
