import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { BridgeOption, StorageOption, TemplateOption } from '../../shared/pve-options';
import { networkSchema, type NetworkSpec, type ProfileSpec } from '../../shared/schema';
import { nodePath, pve, type PveNetwork } from './pve';
import { networks } from './records';
import { ensure } from './errors';

export const networkInputSchema = networkSchema.extend({ bridge: networkSchema.shape.bridge.optional() });

export async function bridgeOptions(): Promise<BridgeOption[]> {
  const entries = await pve<(PveNetwork & { bridge_vlan_aware?: number })[]>(nodePath() + '/network', 'GET', { type: 'any_bridge' });
  return entries.filter(entry => ['bridge', 'OVSBridge', 'vnet'].includes(entry.type) && Number(entry.active) === 1)
    .map(entry => ({ iface: entry.iface, type: entry.type, address: entry.address, vlanAware: !!entry.bridge_vlan_aware })).sort((a, b) => a.iface.localeCompare(b.iface));
}

export async function storageOptions(): Promise<StorageOption[]> {
  const entries = await pve<{ storage: string; type: string; active: number; enabled: number; content: string; avail: number; total: number }[]>(nodePath() + '/storage');
  return entries.filter(entry => Number(entry.active) === 1 && Number(entry.enabled) === 1)
    .map(entry => ({ storage: entry.storage, type: entry.type, content: entry.content.split(','), available: entry.avail, total: entry.total }))
    .sort((a, b) => a.storage.localeCompare(b.storage));
}

export async function templateOptions(availableStores?: StorageOption[]): Promise<TemplateOption[]> {
  const stores = (availableStores || await storageOptions()).filter(storage => storage.content.includes('vztmpl'));
  const groups = await Promise.all(stores.map(async storage => {
    const entries = await pve<{ volid: string; size: number }[]>(nodePath() + '/storage/' + encodeURIComponent(storage.storage) + '/content', 'GET', { content: 'vztmpl' });
    return entries.flatMap(entry => {
      const distro = entry.volid.split('/').pop()?.match(/^(ubuntu|debian)-.*-standard_.*_amd64\.tar\.(?:zst|xz|gz)$/)?.[1];
      return distro ? [{ volid: entry.volid, size: entry.size, storage: storage.storage, distro: distro as 'ubuntu' | 'debian' }] : [];
    });
  }));
  return groups.flat().sort((a, b) => a.volid.localeCompare(b.volid));
}

export async function validateProfileOptions(profile: ProfileSpec) {
  const stores = await storageOptions(), templates = await templateOptions(stores);
  ensure(stores.some(storage => storage.storage === profile.storage && storage.content.includes('rootdir')), 400, '所选系统盘存储不可用或不支持容器');
  ensure(templates.some(template => template.volid === profile.template && template.distro === profile.distro), 400, '所选模板不存在、不可用或发行版不匹配');
}

export async function prepareNetwork(input: z.infer<typeof networkInputSchema>, id?: string): Promise<NetworkSpec> {
  if (input.mode === 'bridge') {
    const choices = await bridgeOptions(), bridge = choices.find(option => option.iface === input.bridge);
    ensure(bridge, 400, '请选择可用的现有网桥或 VNet');
    ensure(!input.vlan || bridge.vlanAware, 400, '所选网桥不支持 VLAN 标签');
    return networkSchema.parse(input);
  }
  const existing = networks().find(network => network.id === id && network.mode === 'nat');
  let bridge = existing?.bridge;
  if (!bridge) {
    const [interfaces, vnets] = await Promise.all([pve<PveNetwork[]>(nodePath() + '/network'), pve<{ vnet: string }[]>('/cluster/sdn/vnets')]);
    const occupied = new Set([...interfaces.map(entry => entry.iface), ...vnets.map(entry => entry.vnet), ...networks().map(entry => entry.bridge)]);
    do { bridge = 'dc' + randomBytes(3).toString('hex'); } while (occupied.has(bridge));
  }
  return networkSchema.parse({ ...input, bridge, vlan: null });
}
