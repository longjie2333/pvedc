import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { studentBatch, batchStatus } from '../server/lib/student-batch';
import { closeDb, getDb } from '../server/lib/db';
import { saveNetwork, saveProfile, saveStudents } from '../server/lib/catalog';
import { getSettings, saveSettings } from '../server/lib/settings';
import { students, taskForActor, type FullJobRow } from '../server/lib/records';
import { taskPage } from '../server/lib/activity';
import { allocate, enqueue } from '../server/lib/provision';
import { authenticateAccess, issueSession } from '../server/lib/sessions';
import { runJob, workerTick } from '../server/lib/worker';
import { retryTask } from '../server/lib/task-recovery';
import * as pve from '../server/lib/pve';
import * as gost from '../server/lib/gost';
import type { Actor, Network, Profile } from '../shared/schema';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-batch-test-'));
const admin: Actor = { role: 'admin', sub: 'admin', sessionId: 'test' };
let network: Network, profile: Profile;
const live = new Set<number>();
const job = (id: string) => getDb().prepare('SELECT * FROM jobs WHERE id=?').get(id) as FullJobRow;
beforeAll(() => {
  process.env.PDC_DATA_DIR = directory;
  network = { ...saveNetwork({ name: 'Batch network', mode: 'nat', bridge: 'dcbatch', cidr: '172.30.0.0/24', gateway: '172.30.0.1', start: '172.30.0.10', end: '172.30.0.50', dns: ['1.1.1.1'] }), ready: true, error: null };
  getDb().prepare('UPDATE networks SET ready=1').run();
  profile = saveProfile({ name: 'Batch profile', template: 'local:vztmpl/debian-13-standard_test_amd64.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 1, memory: 512, disk: 4, networkId: network.id, published: true });
  saveSettings({ ...getSettings(), registrationOpen: true, defaultProfileId: profile.id });
});
beforeEach(() => {
  const db = getDb();
  for (const table of ['jobs', 'forwards', 'resources', 'students', 'sessions', 'audit']) db.prepare('DELETE FROM ' + table).run();
  saveStudents(['a001', 'a002', 'a003'].map(id => ({ id, name: '学生-' + id, className: 'Test', profileId: null, enabled: true })));
  for (const [index, id] of ['a001', 'a003'].entries()) db.prepare('INSERT INTO resources(id,student_id,vmid,profile_id,network_id,ip,spec,network,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,0)')
    .run('resource-' + id, id, 1001 + index, profile.id, network.id, '172.30.0.' + (10 + index), JSON.stringify(profile), JSON.stringify(network), 'ready');
  live.clear(); live.add(1001); live.add(1002);
  vi.spyOn(gost, 'syncForwards').mockResolvedValue();
  vi.spyOn(pve, 'containerExists').mockImplementation(async id => live.has(id));
  vi.spyOn(pve, 'guestConfig').mockImplementation(async () => ({ tags: pve.ownershipTag() }));
  vi.spyOn(pve, 'taskStatus').mockResolvedValue({ status: 'stopped', success: true, exitstatus: 'OK' });
  vi.spyOn(pve, 'pve').mockImplementation(async (path, method) => {
    if (path.endsWith('/tasks')) return [];
    if (path.endsWith('/status/current')) return { status: 'stopped' };
    if (method === 'DELETE') { live.delete(Number(path.split('/').pop())); return 'UPID:delete'; }
    return 'UPID:power';
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR;
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-batch-test-'))) throw new Error('Unsafe cleanup');
  rmSync(directory, { recursive: true, force: true });
});

it('requires admin confirmation before any destructive changes', async () => {
  await expect(studentBatch({ ...admin, role: 'student' }, { ids: ['a001'], action: 'delete' })).rejects.toMatchObject({ status: 403 });
  await expect(studentBatch(admin, { ids: ['a001'], action: 'delete', confirmation: 'wrong' })).rejects.toMatchObject({ status: 400 });
  expect(getDb().prepare('SELECT * FROM jobs').all()).toHaveLength(0);
  expect(students().every(student => student.enabled)).toBe(true);
});
it('deduplicates IDs, reports missing resources/accounts and aggregates batch progress', async () => {
  const result = await studentBatch(admin, { ids: ['a001', 'a001', 'a002', 'a999'], action: 'start' });
  expect(result.items.map(item => item.status)).toEqual(['queued', 'skipped', 'failed']);
  expect(batchStatus(result.batchId)).toMatchObject({ total: 1, queued: 1 });
  await runJob(job(result.items[0].taskId!)); await runJob(job(result.items[0].taskId!));
  expect(batchStatus(result.batchId)).toMatchObject({ total: 1, succeeded: 1 });
});
it('deletes independent students, revokes sessions and preserves recoverable failures', async () => {
  enqueue('start', 'a003', 'resource-a003', {});
  const session = await issueSession('student', 'a001');
  const result = await studentBatch(admin, { ids: ['a001', 'a002', 'a003', 'a999'], action: 'delete', confirmation: '删除 4 名学生' });
  expect(result.items.map(item => item.status)).toEqual(['queued', 'queued', 'failed', 'failed']);
  expect(students().find(student => student.id === 'a001')).toMatchObject({ enabled: false, deleting: true });
  expect(students().find(student => student.id === 'a003')?.enabled).toBe(true);
  expect(await authenticateAccess(session.token)).toBeNull();
  expect(() => saveStudents([{ id: 'a001', name: 'Cannot reenable', className: '', enabled: true, profileId: null }])).toThrow('正在删除');
  await expect(allocate('a002', 'irrelevant-password')).rejects.toThrow('停用');
  for (const item of result.items.filter(item => item.taskId)) {
    for (let step = 0; step < 8 && job(item.taskId!).state !== 'succeeded'; step++) await runJob(job(item.taskId!));
    expect(job(item.taskId!).state).toBe('succeeded');
  }
  expect(students().map(student => student.id)).toEqual(['a003']);
  expect(batchStatus(result.batchId)).toMatchObject({ total: 2, succeeded: 2 });
  expect(taskForActor(result.items[0].taskId!, admin).studentId).toBe('a001');
  expect(taskPage({ q: '学生-a001' }, admin).total).toBe(1);
  saveStudents([{ id: 'a001', name: 'New identity', className: '', enabled: true, profileId: null }]);
  expect(taskPage({}, { role: 'student', sub: 'a001', sessionId: 'new' }).total).toBe(0);
  expect(() => taskForActor(result.items[0].taskId!, { role: 'student', sub: 'a001', sessionId: 'new' })).toThrow('不存在');
});
it('removes forwards before releasing the resource and deleting the account', async () => {
  getDb().prepare("INSERT INTO forwards(id,student_id,resource_id,protocol,public_port,target_port,note,state) VALUES('forward','a001','resource-a001','tcp',11001,22,'','ready')").run();
  const result = await studentBatch(admin, { ids: ['a001'], action: 'delete', confirmation: '删除 1 名学生' });
  const id = result.items[0].taskId!;
  vi.mocked(gost.syncForwards).mockRejectedValueOnce(new Error('Relay unavailable'));
  await expect(runJob(job(id))).rejects.toThrow('Relay unavailable');
  expect(students().some(student => student.id === 'a001')).toBe(true);
  expect(getDb().prepare('SELECT * FROM forwards').all()).toHaveLength(1);
  for (let step = 0; step < 8 && job(id).state !== 'succeeded'; step++) await runJob(job(id));
  expect(gost.syncForwards).toHaveBeenCalledWith('resource-a001', true);
  expect(getDb().prepare('SELECT * FROM forwards').all()).toHaveLength(0);
  expect(students().some(student => student.id === 'a001')).toBe(false);
});
it('keeps an ownership failure for retry and resumes after backend restart', async () => {
  const result = await studentBatch(admin, { ids: ['a001'], action: 'delete', confirmation: '删除 1 名学生' });
  const id = result.items[0].taskId!;
  vi.mocked(pve.guestConfig).mockResolvedValueOnce({ tags: 'unrelated' });
  await workerTick();
  expect(job(id).state).toBe('attention');
  expect(students().find(student => student.id === 'a001')?.enabled).toBe(false);
  closeDb();
  await retryTask(admin, id);
  for (let step = 0; step < 8 && job(id).state !== 'succeeded'; step++) await workerTick();
  expect(job(id).state).toBe('succeeded');
  expect(live.has(1001)).toBe(false);
});
