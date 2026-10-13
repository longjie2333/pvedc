import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

vi.mock('../server/lib/inventory', async importOriginal => {
  const actual = await importOriginal<typeof import('../server/lib/inventory')>();
  return { ...actual, inventory: async () => ({
    entries: [{ type: 'storage', storage: 'local-lvm', node: 'r550', status: 'available', maxdisk: 64 * 1073741824, disk: 0 }],
    node: { cpu: 0, cpuinfo: { cpus: 2 }, memory: { total: 4 * 1073741824, free: 0, used: 4 * 1073741824 }, uptime: 1000 },
    interfaces: [{ iface: 'vmbr0', address: '10.1.229.140', type: 'bridge' }], configs: [],
  }) };
});
import { allocate } from '../server/lib/provision';
import { budgetFor, inventory } from '../server/lib/inventory';
import { closeDb, getDb } from '../server/lib/db';
import { saveNetwork, saveProfile, saveStudents } from '../server/lib/catalog';
import { getSettings, saveSettings } from '../server/lib/settings';
import { profiles, resources } from '../server/lib/records';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-capacity-limit-test-'));
beforeAll(() => {
  process.env.PDC_DATA_DIR = directory;
  const network = saveNetwork({ name: 'Single address', mode: 'nat', bridge: 'dctest', cidr: '172.30.0.0/24', gateway: '172.30.0.1', start: '172.30.0.10', end: '172.30.0.10', dns: ['1.1.1.1'], excluded: [], vlan: null });
  getDb().prepare('UPDATE networks SET ready=1').run();
  const profile = saveProfile({ name: 'Test', published: true, enabled: true, template: 'local:vztmpl/debian-13-test.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 1, memory: 512, swap: 0, disk: 4, networkIds: [network.id], nesting: false }).id;
  saveSettings({ ...getSettings(), defaultProfileId: profile, registrationOpen: true });
  saveStudents(['00001001', '00001002'].map(id => ({ id, name: id, className: 'test', profileId: null, enabled: true })));
});
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR;
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-capacity-limit-test-'))) throw new Error('Unsafe test cleanup path');
  rmSync(directory, { recursive: true, force: true });
});
it('creates a resource even when the host estimate is zero', async () => {
  expect(budgetFor(profiles()[0], await inventory()).capacity.count).toBe(0);
  await allocate('00001001', 'First-student-password', undefined, true);
  const resource = resources()[0];
  expect(resource.studentId).toBe('00001001');
  expect(resource.networks[0].ip).toBe('172.30.0.10');
  expect(resource.state).toBe('reserved');
});
it('rejects a second resource when the address pool is exhausted', async () => {
  await expect(allocate('00001002', 'Second-student-password', undefined, true)).rejects.toThrow('网络 Single address 已无可用地址');
  expect(resources()).toHaveLength(1);
  const student = getDb().prepare('SELECT password_hash FROM students WHERE id=?').get('00001002') as { password_hash: string | null };
  expect(student.password_hash).toBeNull();
  const jobs = getDb().prepare('SELECT count(*) count FROM jobs WHERE student_id=?').get('00001002') as { count: number };
  expect(jobs.count).toBe(0);
});
it('rejects when the VMID range is exhausted', async () => {
  saveSettings({ ...getSettings(), vmidStart: 1000, vmidEnd: 1000, registrationOpen: true });
  await expect(allocate('00001002', 'Second-student-password', undefined, true)).rejects.toThrow('可用 VMID 已用尽');
  expect(resources()).toHaveLength(1);
});
