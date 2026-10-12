import { availableIps, calculateCapacity } from './allocation';
import { guestConfig, nodePath, pve, volumeSizeGiB, type GuestConfig, type NodeStatus, type PveNetwork, type PveResource } from './pve';
import { networks, profiles, resources } from './records';
import { getSettings } from './settings';
import { ensure } from './errors';
import type { Profile } from '../../shared/schema';

export interface Inventory { entries: PveResource[]; node: NodeStatus; interfaces: PveNetwork[]; configs: { vmid: number; type: string; config: GuestConfig }[] }
export async function inventory(): Promise<Inventory> {
  const [entries, node, interfaces] = await Promise.all([
    pve<PveResource[]>('/cluster/resources'), pve<NodeStatus>(nodePath() + '/status'), pve<PveNetwork[]>(nodePath() + '/network'),
  ]);
  const guests = entries.filter(e => ['lxc', 'qemu'].includes(e.type) && e.node === getSettings().pveNode);
  const configs = [];
  // Bound PVE concurrency for large rosters.
  for (let start = 0; start < guests.length; start += 8) {
    configs.push(...await Promise.all(guests.slice(start, start + 8).map(async e => ({ vmid: e.vmid!, type: e.type, config: await guestConfig(e.vmid!, e.type, e.node) }))));
  }
  return { entries, node, interfaces, configs };
}

export function budgetFor(profile: Profile, snapshot: Inventory) {
  const settings = getSettings(), managed = resources(), all = networks();
  const occupied = occupiedIps(snapshot, managed);
  const pools = profile.networkIds.map(networkId => {
    const network = all.find(n => n.id === networkId);
    ensure(network?.ready && !network.error, 409, '网络尚未应用或需要处理错误');
    return { network, ips: availableIps(network, occupied) };
  });
  const storage = snapshot.entries.find(e => e.type === 'storage' && e.storage === profile.storage && e.node === settings.pveNode);
  ensure(storage?.maxdisk && storage.status === 'available', 409, '存储不可用');
  let allocatedCpu = 0, allocatedMemory = 0, allocatedDisk = 0;
  for (const guest of snapshot.configs) {
    allocatedCpu += Number(guest.config.cores || (guest.type === 'lxc' ? snapshot.node.cpuinfo.cpus : 1)) * Number(guest.config.sockets || 1);
    allocatedMemory += Number(guest.config.memory || 512);
    for (const [key, value] of Object.entries(guest.config)) {
      if (/^(rootfs|mp\d+|scsi\d+|virtio\d+|sata\d+|ide\d+)$/.test(key) && typeof value === 'string' && value.startsWith(profile.storage + ':') && !value.includes('media=cdrom')) allocatedDisk += volumeSizeGiB(value);
    }
  }
  const pveIds = new Set(snapshot.entries.filter(e => e.vmid).map(e => e.vmid));
  const pending = managed.filter(r => !pveIds.has(r.vmid));
  for (const resource of pending) {
    allocatedCpu += resource.spec.cores; allocatedMemory += resource.spec.memory;
    if (resource.spec.storage === profile.storage) allocatedDisk += resource.spec.disk;
  }
  const occupiedIds = new Set([...pveIds, ...managed.map(r => r.vmid)]);
  let vmid = settings.vmidStart;
  while (vmid <= settings.vmidEnd && occupiedIds.has(vmid)) vmid++;
  const usedVmids = [...occupiedIds].filter(id => id !== undefined && id >= settings.vmidStart && id <= settings.vmidEnd).length;
  const capacity = calculateCapacity(profile, {
    cpu: (snapshot.node.cpuinfo.cpus - settings.reserveCpu) * settings.cpuOvercommit - allocatedCpu,
    memory: snapshot.node.memory.total / 1048576 - settings.reserveMemory - allocatedMemory,
    disk: storage.maxdisk / 1073741824 - settings.reserveDisk - allocatedDisk,
    freeDisk: (storage.maxdisk - (storage.disk || 0)) / 1073741824 - settings.reserveDisk - pending.filter(r => r.spec.storage === profile.storage).reduce((sum, r) => sum + r.spec.disk, 0),
    ips: Math.min(...pools.map(pool => pool.ips.length)), vmids: settings.vmidEnd - settings.vmidStart + 1 - usedVmids,
  });
  return { capacity, vmid, networks: pools.map(pool => ({ network: pool.network, ip: pool.ips[0] })) };
}
export function occupiedIps(snapshot: Inventory, managed = resources()) {
  const occupied = new Set(managed.flatMap(resource => resource.networks.map(entry => entry.ip)));
  for (const iface of snapshot.interfaces) if (iface.address) occupied.add(iface.address);
  for (const guest of snapshot.configs) {
    for (const [key, value] of Object.entries(guest.config)) {
      if (/^net\d+$/.test(key) && typeof value === 'string') {
        const ip = value.match(/(?:^|,)ip=(\d+\.\d+\.\d+\.\d+)\//)?.[1];
        if (ip) occupied.add(ip);
      }
    }
  }
  return occupied;
}
// Host resources already committed to guests, optionally excluding one machine that is being reconfigured.
export function usage(snapshot: Inventory, exclude?: { resourceId: string; vmid: number }) {
  let cpu = 0, memory = 0;
  for (const guest of snapshot.configs) {
    if (exclude && guest.vmid === exclude.vmid) continue;
    cpu += Number(guest.config.cores || (guest.type === 'lxc' ? snapshot.node.cpuinfo.cpus : 1)) * Number(guest.config.sockets || 1);
    memory += Number(guest.config.memory || 512);
  }
  const pveIds = new Set(snapshot.entries.filter(entry => entry.vmid).map(entry => entry.vmid));
  for (const resource of resources()) {
    if (exclude && resource.id === exclude.resourceId) continue;
    if (exclude && resource.vmid === exclude.vmid) continue;
    if (pveIds.has(resource.vmid)) continue;
    cpu += resource.spec.cores; memory += resource.spec.memory;
  }
  return { cpu, memory };
}
export async function allCapacities() {
  const snapshot = await inventory();
  return profiles().map(profile => {
    try { return { profileId: profile.id, ...budgetFor(profile, snapshot).capacity, error: null }; }
    catch (e) { return { profileId: profile.id, count: 0, error: e instanceof Error ? e.message : '配置不可用' }; }
  });
}
