import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

vi.mock('../server/lib/helper', () => ({ helper: vi.fn(async () => ({})) }));
import { adjustResource } from '../server/lib/adjust';
import { closeDb, getDb } from '../server/lib/db';
import { saveNetwork, saveProfile, saveStudents } from '../server/lib/catalog';
import { getSettings, saveSettings } from '../server/lib/settings';
import { resources, type FullJobRow } from '../server/lib/records';
import * as pve from '../server/lib/pve';
import { runJob, workerTick } from '../server/lib/worker';
import { retryTask } from '../server/lib/task-recovery';
import { AppError } from '../server/lib/errors';
import type { Actor, MachineNetwork, Profile } from '../shared/schema';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-adjust-test-'));
const admin: Actor = { role: 'admin', sub: 'admin', sessionId: 'test' };
const snapshot = {
  entries: [{ type: 'storage', storage: 'local-lvm', node: 'r550', status: 'available', maxdisk: 2_000_000_000_000, disk: 0 }],
  node: { cpu: 0, cpuinfo: { cpus: 32 }, memory: { total: 128 * 1073741824, free: 100 * 1073741824, used: 1 }, uptime: 1 },
  interfaces: [{ iface: 'vmbr0', address: '10.1.229.140', type: 'bridge', active: 1 }, { iface: 'vmbr1', type: 'bridge', active: 1 }],
  configs: [],
};
let liveConfig: Record<string, unknown> = {};
let powerState = 'running';
let injected: Error | undefined;
let firstNetworkId = '', secondNetworkId = '', profileId = '';
const resourceId = 'resource-adjust';
const job = () => getDb().prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 1').get() as FullJobRow;
const jobState = () => (getDb().prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 1').get() as FullJobRow | undefined)?.state;
const originalNetworks = (): MachineNetwork[] => [
  { iface: 'eth0', networkId: firstNetworkId, name: 'Adjust network', bridge: 'dcadj1', cidr: '172.16.32.0/24', ip: '172.16.32.10', gateway: '172.16.32.1', dns: ['223.5.5.5'], vlan: null, mac: 'AA:BB:CC:DD:EE:01' },
  { iface: 'eth1', networkId: secondNetworkId, name: 'Adjust bridge', bridge: 'dcadj2', cidr: '172.16.33.0/24', ip: '172.16.33.10', gateway: null, dns: [], vlan: null, mac: 'AA:BB:CC:DD:EE:02' },
];

beforeAll(() => {
  process.env.PDC_DATA_DIR = directory;
  const first = saveNetwork({ name: 'Adjust network', mode: 'nat', bridge: 'dcadj1', cidr: '172.16.32.0/24', gateway: '172.16.32.1', start: '172.16.32.10', end: '172.16.32.200', dns: ['223.5.5.5'], excluded: [], vlan: null });
  const second = saveNetwork({ name: 'Adjust bridge', mode: 'nat', bridge: 'dcadj2', cidr: '172.16.33.0/24', gateway: '172.16.33.1', start: '172.16.33.10', end: '172.16.33.200', dns: ['1.1.1.1'], excluded: [], vlan: null });
  getDb().prepare('UPDATE networks SET ready=1').run();
  firstNetworkId = first.id; secondNetworkId = second.id;
  profileId = saveProfile({ name: 'Adjust profile', published: true, enabled: true, template: 'local:vztmpl/debian-13-test.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 1, memory: 512, swap: 0, disk: 8, networkIds: [first.id, second.id], nesting: false }).id;
  saveSettings({ ...getSettings(), defaultProfileId: profileId, registrationOpen: true, vmidStart: 1001, vmidEnd: 1100, reserveCpu: 2, reserveMemory: 4096, reserveDisk: 10 });
  saveStudents([{ id: 'adj001', name: 'Adjust student', className: '', profileId: null, enabled: true }]);
  vi.spyOn(pve, 'containerExists').mockResolvedValue(true);
  vi.spyOn(pve, 'guestConfig').mockImplementation(async () => liveConfig as never);
  vi.spyOn(pve, 'taskStatus').mockResolvedValue({ status: 'stopped', success: true, exitstatus: 'OK' });
  vi.spyOn(pve, 'pve').mockImplementation(async (path, method, params) => {
    if (injected) { const error = injected; injected = undefined; throw error; }
    if (path === '/cluster/resources') return snapshot.entries as never;
    if (path.endsWith('/status')) return snapshot.node as never;
    if (path.endsWith('/network')) return snapshot.interfaces as never;
    if (path === '/nodes/r550/lxc/1001/status/current') return { status: powerState } as never;
    if (path === '/nodes/r550/lxc/1001/config' && method === 'PUT') {
      for (const [key, value] of Object.entries(params || {})) {
        if (key === 'delete') for (const name of String(value).split(',')) delete liveConfig[name];
        else liveConfig[key] = value;
      }
      return null as never;
    }
    if (path.endsWith('/resize') && method === 'PUT') {
      liveConfig.rootfs = 'local-lvm:vm-1001-disk-0,size=' + (8 + Number(String(params?.size).replace(/\D/g, ''))) + 'G';
      return 'UPID:resize' as never;
    }
    if (path.endsWith('/status/shutdown') || path.endsWith('/status/start')) return 'UPID:power' as never;
    return null as never;
  });
});
beforeEach(() => {
  const db = getDb();
  db.prepare('DELETE FROM jobs').run();
  db.prepare('DELETE FROM resources').run();
  const spec: Profile = { id: profileId, name: 'Adjust profile', published: true, enabled: true, template: 'local:vztmpl/debian-13-test.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 1, memory: 512, swap: 0, disk: 8, networkIds: [firstNetworkId, secondNetworkId], nesting: false, initialForwards: [] };
  db.prepare('INSERT INTO resources(id,student_id,vmid,profile_id,networks,spec,state,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(resourceId, 'adj001', 1001, profileId, JSON.stringify(originalNetworks()), JSON.stringify(spec), 'ready', 1);
  liveConfig = {
    tags: pve.ownershipTag(), cores: 1, memory: 512, swap: 0, rootfs: 'local-lvm:vm-1001-disk-0,size=8G',
    net0: 'name=eth0,bridge=dcadj1,ip=172.16.32.10/24,gw=172.16.32.1,hwaddr=AA:BB:CC:DD:EE:01',
    net1: 'name=eth1,bridge=dcadj2,ip=172.16.33.10/24,hwaddr=AA:BB:CC:DD:EE:02',
  };
  powerState = 'running';
  injected = undefined;
});
afterEach(() => vi.clearAllMocks());
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR; vi.restoreAllMocks();
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-adjust-test-'))) throw new Error('Unsafe cleanup');
  rmSync(directory, { recursive: true, force: true });
});

const baseSpec = { cores: 2, memory: 1024, swap: 0, disk: 8 };
const row = (iface: string, networkId: string | null) => ({ iface, networkId, bridge: '', cidr: '', ip: '', gateway: '', dns: [] as string[], vlan: null, macMode: 'keep' as const, mac: null });
const custom = (iface: string, patch: Record<string, unknown> = {}) => ({ ...row(iface, null), bridge: 'vmbr1', cidr: '10.51.0.0/24', ip: '10.51.0.5', ...patch });
const keepRows = () => originalNetworks().map(entry => row(entry.iface, entry.networkId));

it('requires administrator privileges and a real change', async () => {
  const current = { cores: 1, memory: 512, swap: 0, disk: 8 };
  await expect(adjustResource({ role: 'student', sub: 'adj001', sessionId: 's' }, resourceId, { spec: current, networks: keepRows() })).rejects.toThrow('管理员');
  await expect(adjustResource(admin, resourceId, { spec: current, networks: keepRows() })).rejects.toThrow('没有需要应用的变更');
  expect(getDb().prepare('SELECT count(*) count FROM jobs').get()).toEqual({ count: 0 });
});

it('enforces confirmation before changing networks on a running machine', async () => {
  const networks = [keepRows()[0], custom('eth1')];
  await expect(adjustResource(admin, resourceId, { spec: baseSpec, networks, confirmShutdown: false })).rejects.toThrow('确认停机');
  await expect(adjustResource(admin, resourceId, { spec: baseSpec, networks, confirmShutdown: true })).resolves.toHaveProperty('taskId');
});

it('rejects shrinking disks, unknown networks and forged custom bridges', async () => {
  await expect(adjustResource(admin, resourceId, { spec: { ...baseSpec, disk: 4 }, networks: keepRows() })).rejects.toThrow('不能缩小');
  await expect(adjustResource(admin, resourceId, { spec: baseSpec, networks: [row('eth0', 'missing'), keepRows()[1]] })).rejects.toThrow('尚未应用');
  await expect(adjustResource(admin, resourceId, { spec: baseSpec, networks: [custom('eth0', { bridge: 'vmbr9' })] })).rejects.toThrow('请选择可用的现有网桥');
  await expect(adjustResource(admin, resourceId, { spec: baseSpec, networks: [custom('eth0', { cidr: '192.168.50.0/24', ip: '192.168.50.300' })] })).rejects.toThrow('IP');
  expect(getDb().prepare('SELECT count(*) count FROM jobs').get()).toEqual({ count: 0 });
});

it('applies a custom bridge network to an existing stopped container', async () => {
  powerState = 'stopped';
  const result = await adjustResource(admin, resourceId, {
    spec: { cores: 4, memory: 2048, swap: 512, disk: 12 },
    networks: [custom('eth0', { cidr: '192.168.50.0/24', ip: '192.168.50.20', gateway: '192.168.50.1', dns: ['9.9.9.9'], macMode: 'set', mac: 'AA:BB:CC:00:11:22' })],
  });
  expect(result).toHaveProperty('taskId');
  for (let step = 0; step < 8 && jobState() !== 'succeeded'; step++) await runJob(job());
  expect(jobState()).toBe('succeeded');
  expect(liveConfig.net0).toBe('name=eth0,bridge=vmbr1,ip=192.168.50.20/24,gw=192.168.50.1,hwaddr=AA:BB:CC:00:11:22');
  expect(liveConfig.cores).toBe(4); expect(liveConfig.memory).toBe(2048); expect(liveConfig.swap).toBe(512);
  expect(liveConfig.net1).toBeUndefined();
  expect(String(liveConfig.rootfs)).toContain('size=12G');
  const stored = resources()[0];
  expect(stored.spec.cores).toBe(4); expect(stored.spec.disk).toBe(12);
  expect(stored.networks).toEqual([{ iface: 'eth0', networkId: null, name: '自定义 vmbr1', bridge: 'vmbr1', cidr: '192.168.50.0/24', ip: '192.168.50.20', gateway: '192.168.50.1', dns: ['9.9.9.9'], vlan: null, mac: 'AA:BB:CC:00:11:22' }]);
});

it('stops a running container, applies the change and starts it again', async () => {
  const result = await adjustResource(admin, resourceId, {
    spec: baseSpec, confirmShutdown: true,
    networks: [keepRows()[0], custom('eth1', { cidr: '10.50.0.0/24', ip: '10.50.0.5', macMode: 'auto' })],
  });
  expect(result).toHaveProperty('taskId');
  for (let step = 0; step < 10 && jobState() !== 'succeeded'; step++) await runJob(job());
  expect(jobState()).toBe('succeeded');
  const calls = vi.mocked(pve.pve).mock.calls.map(call => call[0] + ' ' + call[1]);
  expect(calls).toContain('/nodes/r550/lxc/1001/status/shutdown POST');
  expect(calls).toContain('/nodes/r550/lxc/1001/status/start POST');
  expect(String(liveConfig.net1)).not.toContain('hwaddr');
  expect(String(liveConfig.net0)).toContain('hwaddr=AA:BB:CC:DD:EE:01');
  const stored = resources()[0];
  expect(stored.networks[1]).toMatchObject({ iface: 'eth1', ip: '10.50.0.5', bridge: 'vmbr1', mac: null });
  expect(stored.spec.cores).toBe(2); expect(stored.spec.memory).toBe(1024);
});

it('keeps a failed apply in attention with the snapshot untouched', async () => {
  powerState = 'stopped';
  const result = await adjustResource(admin, resourceId, { spec: baseSpec, networks: [custom('eth0')] });
  expect(result).toHaveProperty('taskId');
  const before = JSON.stringify(resources()[0].networks);
  injected = new AppError(502, 'PVE 暂时不可达', 'PVE_UNREACHABLE');
  await workerTick();
  expect(jobState()).toBe('attention');
  expect(JSON.stringify(resources()[0].networks)).toBe(before);
  // Retry clears the failure and completes the same task without duplicating the change.
  await retryTask(admin, (job() as FullJobRow).id);
  for (let step = 0; step < 8 && jobState() !== 'succeeded'; step++) await runJob(job());
  expect(jobState()).toBe('succeeded');
  expect(JSON.stringify(resources()[0].networks)).toContain('10.51.0.5');
});

it('updates the snapshot directly when no container was ever created', async () => {
  vi.mocked(pve.containerExists).mockResolvedValue(false);
  const result = await adjustResource(admin, resourceId, { spec: { ...baseSpec, cores: 8, disk: 16 }, networks: keepRows() });
  expect(result).toEqual({ applied: true });
  const stored = resources()[0];
  expect(stored.spec.cores).toBe(8); expect(stored.spec.disk).toBe(16);
  expect(getDb().prepare('SELECT count(*) count FROM jobs').get()).toEqual({ count: 0 });
});
