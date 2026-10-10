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
import { allocate } from '../server/lib/provision';
import { closeDb, getDb } from '../server/lib/db';
import { saveNetwork, saveProfile, saveStudents } from '../server/lib/catalog';
import { getSettings, saveSettings } from '../server/lib/settings';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-initial-forward-test-'));
beforeAll(() => {
  process.env.PDC_DATA_DIR = directory;
  const network = saveNetwork({ name: 'Forward network', mode: 'nat', bridge: 'dcfwd', cidr: '172.31.0.0/24', gateway: '172.31.0.1', start: '172.31.0.10', end: '172.31.0.20', dns: ['1.1.1.1'], excluded: [], vlan: null });
  getDb().prepare('UPDATE networks SET ready=1').run();
  const profile = saveProfile({ name: 'Forward profile', published: true, enabled: true, template: 'local:vztmpl/debian-13-test.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 1, memory: 512, swap: 0, disk: 4, networkId: network.id, nesting: false,
    initialForwards: [{ protocol: 'tcp', targetPort: 22, publicPort: 21005, note: 'SSH' }, { protocol: 'udp', targetPort: 53, note: 'DNS' }] }).id;
  saveSettings({ ...getSettings(), defaultProfileId: profile, registrationOpen: true, portStart: 21000, portEnd: 21010 });
  saveStudents([{ id: 'a001', name: 'Forward student', className: '', profileId: null, enabled: true }]);
});
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR;
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-initial-forward-test-'))) throw new Error('Unsafe cleanup');
  rmSync(directory, { recursive: true, force: true });
});

it('reserves configured initial forwards while allocating a resource', async () => {
  const result = await allocate('a001', 'Forward-password', undefined, true);
  expect(result.taskId).toBeTruthy();
  const rows = getDb().prepare('SELECT protocol,public_port,target_port,note,state FROM forwards ORDER BY protocol').all();
  expect(rows).toEqual([
    { protocol: 'tcp', public_port: 21005, target_port: 22, note: 'SSH', state: 'pending' },
    { protocol: 'udp', public_port: 21000, target_port: 53, note: 'DNS', state: 'pending' },
  ]);
});
