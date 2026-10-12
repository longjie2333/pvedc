import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

vi.mock('../server/lib/inventory', async importOriginal => {
  const actual = await importOriginal<typeof import('../server/lib/inventory')>();
  return { ...actual, inventory: async () => ({
    entries: [{ type: 'storage', storage: 'local-lvm', node: 'r550', status: 'available', maxdisk: 64 * 1073741824, disk: 0 }],
    node: { cpu: 0, cpuinfo: { cpus: 32 }, memory: { total: 8 * 1073741824, free: 7 * 1073741824, used: 1073741824 }, uptime: 1000 },
    interfaces: [{ iface: 'vmbr0', address: '10.1.229.140', type: 'bridge' }], configs: [],
  }) };
});
import { studentSchema } from '../shared/schema';
import { allocate } from '../server/lib/provision';
import { closeDb, getDb } from '../server/lib/db';
import { exportStudents, importStudents, removeCatalog, resetClaim, saveNetwork, saveProfile, saveStudents } from '../server/lib/catalog';
import { getSettings, saveSettings } from '../server/lib/settings';
import { studentKey } from '../server/lib/claim-key';
import { resources } from '../server/lib/records';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-claim-key-test-'));
const password = 'Test-student-password';
const student = (id: string) => ({ id, name: id, className: 'test', profileId: null, enabled: true });
beforeAll(() => {
  process.env.PDC_DATA_DIR = directory;
  const network = saveNetwork({ name: 'Key pool', mode: 'nat', bridge: 'dckey', cidr: '172.31.0.0/24', gateway: '172.31.0.1', start: '172.31.0.10', end: '172.31.0.100', dns: ['1.1.1.1'], excluded: [], vlan: null });
  getDb().prepare('UPDATE networks SET ready=1').run();
  const profileId = saveProfile({ name: 'Key test', published: true, enabled: true, template: 'local:vztmpl/debian-13-test.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 1, memory: 512, swap: 0, disk: 4, networkId: network.id, nesting: false }).id;
  saveSettings({ ...getSettings(), defaultProfileId: profileId, registrationOpen: true });
  saveStudents(['k0001', 'k0002', 'k0003', 'k0004'].map(student));
});
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR;
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-claim-key-test-'))) throw new Error('Unsafe test cleanup path');
  rmSync(directory, { recursive: true, force: true });
});

it('validates claim key format while allowing an explicit empty value', () => {
  expect(studentSchema.parse({ id: 'k0009', name: '格式', claimKey: 'Ok.key-1_2' }).claimKey).toBe('Ok.key-1_2');
  expect(studentSchema.parse({ id: 'k0009', name: '格式', claimKey: '' }).claimKey).toBe('');
  expect(studentSchema.parse({ id: 'k0009', name: '格式' }).claimKey).toBeUndefined();
  expect(() => studentSchema.parse({ id: 'k0009', name: '格式', claimKey: '-leading' })).toThrow('认领密钥');
  expect(() => studentSchema.parse({ id: 'k0009', name: '格式', claimKey: 'has space' })).toThrow('认领密钥');
  expect(() => studentSchema.parse({ id: 'k0009', name: '格式', claimKey: 'k'.repeat(65) })).toThrow('认领密钥');
});
it('claims without a key when the student has none stored', async () => {
  await expect(allocate('k0001', password, undefined, true)).resolves.toHaveProperty('taskId');
  const claimed = getDb().prepare('SELECT password_hash FROM students WHERE id=?').get('k0001') as { password_hash: string };
  expect(claimed.password_hash).toBeTruthy();
  expect(studentKey('k0001')).toBe('');
});
it('requires the stored key before a claim can proceed', async () => {
  saveStudents([{ ...student('k0002'), claimKey: 'K7f2m9' }]);
  expect(studentKey('k0002')).toBe('K7f2m9');
  await expect(allocate('k0002', password, undefined, true)).rejects.toThrow('请输入认领密钥');
  await expect(allocate('k0002', password, undefined, true, 'wrong-key')).rejects.toThrow('认领密钥不正确');
  await expect(allocate('k0002', password, undefined, true, 'K7f2m9')).resolves.toHaveProperty('taskId');
  const claimed = getDb().prepare('SELECT password_hash FROM students WHERE id=?').get('k0002') as { password_hash: string };
  expect(claimed.password_hash).toBeTruthy();
});
it('stores claim keys encrypted and returns them to administrators only', () => {
  const row = getDb().prepare('SELECT sealed FROM student_keys WHERE student_id=?').get('k0002') as { sealed: string };
  expect(row.sealed).toBeTruthy();
  expect(row.sealed).not.toContain('K7f2m9');
  expect(studentKey('k0002')).toBe('K7f2m9');
});
it('keeps the claim key when a claim is reset and clears it when set empty', async () => {
  saveStudents([{ ...student('k0003'), claimKey: 'Reset-key-1' }]);
  await expect(allocate('k0003', password, undefined, true, 'Reset-key-1')).resolves.toHaveProperty('taskId');
  getDb().prepare("UPDATE jobs SET state='succeeded' WHERE student_id=?").run('k0003');
  getDb().prepare('DELETE FROM resources WHERE student_id=?').run('k0003');
  resetClaim('k0003');
  expect(studentKey('k0003')).toBe('Reset-key-1');
  await expect(allocate('k0003', password, undefined, true)).rejects.toThrow('请输入认领密钥');
  await expect(allocate('k0003', password, undefined, true, 'Reset-key-1')).resolves.toHaveProperty('taskId');
  saveStudents([{ ...student('k0003'), claimKey: '' }]);
  expect(studentKey('k0003')).toBe('');
});
it('removes the stored key together with the deleted student', () => {
  saveStudents([{ ...student('k0004'), claimKey: 'Delete-key-1' }]);
  removeCatalog('students', 'k0004');
  expect((getDb().prepare('SELECT count(*) count FROM student_keys WHERE student_id=?').get('k0004') as { count: number }).count).toBe(0);
});
it('round-trips claim keys through roster import and export', () => {
  importStudents('学号,姓名,班级,认领密钥\nk0005,五号同学,测试班,Import-key-1');
  expect(studentKey('k0005')).toBe('Import-key-1');
  const exported = exportStudents();
  expect(exported.split('\n')[0]).toContain('认领密钥');
  expect(exported).toContain('Import-key-1');
  importStudents('学号,姓名\nk0005,五号改名');
  expect(studentKey('k0005')).toBe('Import-key-1');
  importStudents('学号,姓名,认领密钥\nk0005,五号同学,');
  expect(studentKey('k0005')).toBe('');
  importStudents('学号,姓名,认领密钥\nk0005,五号同学,Import-key-2');
  expect(studentKey('k0005')).toBe('Import-key-2');
  expect(exportStudents()).toContain('Import-key-2');
});
it('keeps password-based allocation independent from the claim key', async () => {
  const claimed = getDb().prepare('SELECT count(*) count FROM students WHERE password_hash IS NOT NULL').get() as { count: number };
  expect(claimed.count).toBe(3);
  expect(resources().length).toBe(3);
  await expect(allocate('k0002', 'Wrong-student-password')).rejects.toThrow('密码错误');
  await expect(allocate('k0002', password)).resolves.toHaveProperty('taskId');
});
