import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

vi.mock('../server/lib/inventory', async importOriginal => {
  const actual = await importOriginal<typeof import('../server/lib/inventory')>();
  return { ...actual, inventory: async () => ({
    entries: [{ type: 'storage', storage: 'local-lvm', node: 'r550', status: 'available', maxdisk: 64 * 1073741824, disk: 0 }],
    node: { cpu: 0, cpuinfo: { cpus: 4 }, memory: { total: 8 * 1073741824, free: 7 * 1073741824, used: 1073741824 }, uptime: 1000 },
    interfaces: [{ iface: 'vmbr0', address: '10.1.229.140', type: 'bridge' }], configs: [],
  }) };
});
import { allocate, createForward, resourceAction } from '../server/lib/provision';
import { closeDb, getDb } from '../server/lib/db';
import { saveNetwork, saveProfile, saveStudents } from '../server/lib/catalog';
import { getSettings, saveSettings } from '../server/lib/settings';
import { resources } from '../server/lib/records';
import type { FullJobRow } from '../server/lib/records';
import * as pveClient from '../server/lib/pve';
import * as gostClient from '../server/lib/gost';
import { runJob, workerTick } from '../server/lib/worker';
import { AppError } from '../server/lib/errors';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-provision-test-'));
let profileId = '';
beforeAll(() => {
  process.env.PDC_DATA_DIR = directory;
  const network = saveNetwork({ name: 'One address', mode: 'nat', bridge: 'dctest', cidr: '172.30.0.0/24', gateway: '172.30.0.1', start: '172.30.0.10', end: '172.30.0.10', dns: ['1.1.1.1'], excluded: [], vlan: null });
  getDb().prepare('UPDATE networks SET ready=1').run();
  profileId = saveProfile({ name: 'Test', published: true, enabled: true, template: 'local:vztmpl/debian-13-test.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 1, memory: 512, swap: 0, disk: 4, networkIds: [network.id], nesting: false }).id;
  saveSettings({ ...getSettings(), defaultProfileId: profileId, registrationOpen: true });
  saveStudents(['00001001', '00001002'].map(id => ({ id, name: id, className: 'test', profileId: null, enabled: true })));
});
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR;
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-provision-test-'))) throw new Error('Unsafe test cleanup path');
  rmSync(directory, { recursive: true, force: true });
});
it('atomically reserves the last address during concurrent claims', async () => {
  const results = await Promise.allSettled(['00001001', '00001002'].map(id => allocate(id, 'Test-student-password', undefined, true)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  expect(resources()).toHaveLength(1);
  expect(resources()[0].networks[0].ip).toBe('172.30.0.10');
  const claimed = getDb().prepare('SELECT count(*) count FROM students WHERE password_hash IS NOT NULL').get() as { count: number };
  expect(claimed.count).toBe(1);
  const job = getDb().prepare('SELECT secret FROM jobs').get() as { secret: string };
  expect(job.secret).not.toContain('Test-student-password');
});
it('returns the existing allocation on an authenticated repeat', async () => {
  const resource = resources()[0];
  const repeat = await allocate(resource.studentId, 'Test-student-password');
  expect(repeat.taskId).toBe((getDb().prepare('SELECT id FROM jobs').get() as { id: string }).id);
  expect(resources()).toHaveLength(1);
});
it('retains the VMID and IP reservation when a PVE creation request times out', async () => {
  const call = vi.spyOn(pveClient, 'pve').mockRejectedValue(new AppError(502, 'PVE connection timed out', 'PVE_UNREACHABLE'));
  const before = resources()[0];
  await workerTick();
  await workerTick();
  const task = getDb().prepare('SELECT state,step,upid FROM jobs WHERE resource_id=?').get(before.id) as { state: string; step: string; upid: string | null };
  expect(task).toEqual({ state: 'attention', step: 'create-wait', upid: null });
  expect(resources()[0].vmid).toBe(before.vmid); expect(resources()[0].networks[0].ip).toBe(before.networks[0].ip);
  call.mockRestore();
});
it('enforces forwarding ownership and quotas transactionally', () => {
  const resource = resources()[0];
  getDb().prepare('UPDATE jobs SET state=?,secret=NULL').run('succeeded');
  getDb().prepare('UPDATE resources SET state=?').run('ready');
  saveSettings({ ...getSettings(), relayHost: 'relay.example.invalid', gostPassword: 'test-only', forwardQuota: 1 });
  const owner = { role: 'student' as const, sub: resource.studentId, sessionId: 'test-session' };
  expect(() => createForward({ ...owner, sub: 'other-student' }, resource.id, { protocol: 'tcp', targetPort: 22, note: '' })).toThrow('资源不存在');
  const result = createForward(owner, resource.id, { protocol: 'tcp', targetPort: 22, note: '' });
  expect(result.publicPort).toBe(20000);
  expect(() => createForward(owner, resource.id, { protocol: 'tcp', targetPort: 80, note: '' })).toThrow('上限');
  expect((getDb().prepare('SELECT count(*) count FROM forwards').get() as { count: number }).count).toBe(1);
});
it('reclaims a failed resource only after confirming no active PVE work, clearing forwards before releasing leases', async () => {
  vi.spyOn(pveClient, 'containerExists').mockResolvedValue(false);
  vi.spyOn(pveClient, 'pve').mockResolvedValue([]);
  const removeMappings = vi.spyOn(gostClient, 'syncForwards').mockResolvedValue();
  const resource = resources()[0];
  getDb().prepare("UPDATE jobs SET state='attention' WHERE state='queued'").run();
  const result = await resourceAction({ role: 'admin', sub: 'admin', sessionId: 'test' }, resource.id, 'reclaim', { confirmation: resource.studentId });
  expect(resources()).toHaveLength(1);
  await runJob(getDb().prepare('SELECT * FROM jobs WHERE id=?').get(result.taskId) as FullJobRow);
  expect(removeMappings).toHaveBeenCalledWith(resource.id, true);
  expect(resources()).toHaveLength(1);
  await runJob(getDb().prepare('SELECT * FROM jobs WHERE id=?').get(result.taskId) as FullJobRow);
  expect(resources()).toHaveLength(0);
  expect((getDb().prepare('SELECT count(*) count FROM forwards').get() as { count: number }).count).toBe(0);
  expect((getDb().prepare('SELECT state FROM jobs WHERE id=?').get(result.taskId) as { state: string }).state).toBe('succeeded');
});
