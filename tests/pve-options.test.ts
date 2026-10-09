import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const upstream = vi.hoisted(() => ({ pve: vi.fn() }));
vi.mock('../server/lib/pve', () => ({ pve: upstream.pve, nodePath: () => '/nodes/test' }));
import { bridgeOptions, storageOptions, templateOptions, prepareNetwork, validateProfileOptions } from '../server/lib/pve-options';
import { closeDb } from '../server/lib/db';
import { saveNetwork } from '../server/lib/catalog';
import { profileSchema, networkSchema } from '../shared/schema';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-options-test-'));
const template = 'local:vztmpl/debian-13-standard_13.1-1_amd64.tar.zst';
beforeAll(() => {
  process.env.PDC_DATA_DIR = directory;
  upstream.pve.mockImplementation(async (path: string) => {
    if (path.endsWith('/network')) return [{ iface: 'vmbr0', type: 'bridge', active: 1 }, { iface: 'vmbr1', type: 'bridge', active: 0 }, { iface: 'nic0', type: 'eth', active: 1 }, { iface: 'vnet0', type: 'vnet', active: 1, bridge_vlan_aware: 1 }];
    if (path.endsWith('/storage')) return [
      { storage: 'local', type: 'dir', active: 1, enabled: 1, content: 'iso,vztmpl', avail: 100, total: 200 },
      { storage: 'local-lvm', type: 'lvmthin', active: 1, enabled: 1, content: 'rootdir,images', avail: 100, total: 200 },
      { storage: 'disabled', type: 'dir', active: 1, enabled: 0, content: 'rootdir,vztmpl' },
    ];
    if (path.endsWith('/content')) return [{ volid: template, size: 100 }, { volid: 'local:vztmpl/unsupported.tar.zst', size: 100 }];
    if (path === '/cluster/sdn/vnets') return [];
    throw new Error('Unexpected PVE request');
  });
});
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR;
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-options-test-'))) throw new Error('Unsafe cleanup');
  rmSync(directory, { recursive: true, force: true });
});
const network = networkSchema.parse({ name: 'Network', mode: 'nat', bridge: 'ignored', cidr: '172.29.0.0/24', gateway: '172.29.0.1', start: '172.29.0.10', end: '172.29.0.20', dns: ['1.1.1.1'] });

it('only offers usable bridges, available storages and supported downloaded templates', async () => {
  expect((await bridgeOptions()).map(item => item.iface)).toEqual(['vmbr0', 'vnet0']);
  expect((await storageOptions()).map(item => item.storage)).toEqual(['local', 'local-lvm']);
  expect(await templateOptions()).toEqual([{ volid: template, size: 100, storage: 'local', distro: 'debian' }]);
});
it('generates a NAT name and preserves it while editing an existing network', async () => {
  const prepared = await prepareNetwork(network);
  expect(prepared.bridge).toMatch(/^dc[0-9a-f]{6}$/);
  expect(prepared.bridge).not.toBe('ignored');
  const saved = saveNetwork(prepared);
  expect((await prepareNetwork({ ...network, bridge: 'malicious' }, saved.id)).bridge).toBe(saved.bridge);
});
it('rejects forged bridge selections and VLANs on unaware interfaces', async () => {
  await expect(prepareNetwork({ ...network, mode: 'bridge', bridge: 'nic0' })).rejects.toThrow('请选择');
  await expect(prepareNetwork({ ...network, mode: 'bridge', bridge: 'vmbr0', vlan: 100 })).rejects.toThrow('VLAN');
  expect((await prepareNetwork({ ...network, mode: 'bridge', bridge: 'vnet0', vlan: 100 })).vlan).toBe(100);
});
it('validates template existence, distribution and rootdir storage on save', async () => {
  const profile = profileSchema.parse({ name: 'Profile', template, distro: 'debian', storage: 'local-lvm', cores: 2, memory: 1024, disk: 8, networkId: 'network' });
  await expect(validateProfileOptions(profile)).resolves.toBeUndefined();
  await expect(validateProfileOptions({ ...profile, storage: 'local' })).rejects.toThrow('不支持容器');
  await expect(validateProfileOptions({ ...profile, distro: 'ubuntu' })).rejects.toThrow('发行版');
});
