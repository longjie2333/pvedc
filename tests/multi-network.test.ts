import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

vi.mock('../server/lib/inventory', async importOriginal => {
  const actual = await importOriginal<typeof import('../server/lib/inventory')>();
  return { ...actual, inventory: async () => ({
    entries: [{ type: 'storage', storage: 'local-lvm', node: 'r550', status: 'available', maxdisk: 64 * 1073741824, disk: 0 }],
    node: { cpu: 0, cpuinfo: { cpus: 8 }, memory: { total: 8 * 1073741824, free: 7 * 1073741824, used: 1073741824 }, uptime: 1000 },
    interfaces: [{ iface: 'vmbr0', address: '10.1.229.140', type: 'bridge' }], configs: [],
  }) };
});
vi.mock('../server/lib/helper', () => ({ helper: vi.fn(async () => ({})) }));
import { allocate } from '../server/lib/provision';
import { closeDb, getDb } from '../server/lib/db';
import { saveNetwork, saveProfile, saveStudents } from '../server/lib/catalog';
import { getSettings, saveSettings } from '../server/lib/settings';
import { resources, type FullJobRow } from '../server/lib/records';
import * as pveClient from '../server/lib/pve';
import { runJob } from '../server/lib/worker';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-multi-network-test-'));
beforeAll(() => {
  process.env.PDC_DATA_DIR = directory;
  const first = saveNetwork({ name: '校内私网', mode: 'nat', bridge: 'dcone', cidr: '172.16.40.0/24', gateway: '172.16.40.1', start: '172.16.40.10', end: '172.16.40.200', dns: ['223.5.5.5'], excluded: [], vlan: null });
  const second = saveNetwork({ name: '实验桥接', mode: 'nat', bridge: 'dctwo', cidr: '172.16.41.0/24', gateway: '172.16.41.1', start: '172.16.41.20', end: '172.16.41.200', dns: ['1.1.1.1'], excluded: [], vlan: null });
  getDb().prepare('UPDATE networks SET ready=1').run();
  const profile = saveProfile({ name: 'Dual', published: true, enabled: true, template: 'local:vztmpl/debian-13-test.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 2, memory: 1024, swap: 0, disk: 8, networkIds: [first.id, second.id], nesting: false }).id;
  saveSettings({ ...getSettings(), defaultProfileId: profile, registrationOpen: true });
  saveStudents([{ id: 'm0001', name: 'Dual student', className: '', profileId: null, enabled: true }]);
  vi.spyOn(pveClient, 'pve').mockImplementation(async (path, method, params) => {
    if (path.endsWith('/lxc') && method === 'POST') return 'UPID:create';
    if (path.endsWith('/status/start') && method === 'POST') return 'UPID:start';
    if (path.endsWith('/status/current')) return { status: 'running' } as never;
    if (path.endsWith('/tasks')) return [];
    return (params ?? 'UPID:generic') as never;
  });
  vi.spyOn(pveClient, 'taskStatus').mockResolvedValue({ status: 'stopped', success: true, exitstatus: 'OK' });
  vi.spyOn(pveClient, 'guestConfig').mockImplementation(async () => ({
    tags: pveClient.ownershipTag(),
    net0: 'name=eth0,bridge=dcone,ip=172.16.40.10/24,gw=172.16.40.1,hwaddr=AA:BB:CC:DD:EE:01',
    net1: 'name=eth1,bridge=dctwo,ip=172.16.41.20/24,hwaddr=AA:BB:CC:DD:EE:02',
  }));
});
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR; vi.restoreAllMocks();
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-multi-network-test-'))) throw new Error('Unsafe cleanup');
  rmSync(directory, { recursive: true, force: true });
});

it('allocates one address per network and creates one interface per entry', async () => {
  const result = await allocate('m0001', 'Dual-student-password', undefined, true);
  const resource = resources()[0];
  expect(resource.networks.map(entry => entry.iface)).toEqual(['eth0', 'eth1']);
  expect(resource.networks.map(entry => entry.ip)).toEqual(['172.16.40.10', '172.16.41.20']);
  expect(resource.networks[0]).toMatchObject({ gateway: '172.16.40.1', dns: ['223.5.5.5'], mac: null });
  expect(resource.networks[1]).toMatchObject({ gateway: null, dns: [] });
  for (let step = 0; step < 10 && (getDb().prepare('SELECT state FROM jobs WHERE id=?').get(result.taskId) as { state: string }).state !== 'succeeded'; step++) {
    await runJob(getDb().prepare('SELECT * FROM jobs WHERE id=?').get(result.taskId) as FullJobRow);
  }
  const calls = vi.mocked(pveClient.pve).mock.calls;
  const create = calls.find(call => call[0].endsWith('/lxc') && call[1] === 'POST');
  const params = create?.[2] as Record<string, unknown>;
  expect(params.net0).toBe('name=eth0,bridge=dcone,ip=172.16.40.10/24,gw=172.16.40.1');
  expect(params.net1).toBe('name=eth1,bridge=dctwo,ip=172.16.41.20/24');
  expect(params.nameserver).toBe('223.5.5.5');
  const stored = resources()[0];
  expect(stored.state).toBe('ready');
  expect(stored.networks.map(entry => entry.mac)).toEqual(['AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02']);
});

it('keeps resources on the multi-interface snapshot when capacities are recalculated', async () => {
  const { budgetFor } = await import('../server/lib/inventory');
  const { profiles } = await import('../server/lib/records');
  const snapshot = {
    entries: [{ type: 'storage', storage: 'local-lvm', node: 'r550', status: 'available', maxdisk: 64 * 1073741824, disk: 0 }],
    node: { cpu: 0, cpuinfo: { cpus: 8 }, memory: { total: 8 * 1073741824, free: 7 * 1073741824, used: 1073741824 }, uptime: 1000 },
    interfaces: [{ iface: 'vmbr0', address: '10.1.229.140', type: 'bridge' }], configs: [],
  } as never;
  const allocation = budgetFor(profiles()[0], snapshot);
  expect(allocation.networks.map(entry => entry.ip)).toEqual(['172.16.40.11', '172.16.41.21']);
  expect(allocation.capacity.count).toBeGreaterThan(0);
  expect(allocation.capacity.limits.ip).toBe(180);
});
