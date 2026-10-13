import ipaddr from 'ipaddr.js';
import type { Actor, AdjustNetwork, MachineAdjust, MachineNetwork, Resource } from '../../shared/schema';
import { machineAdjustSchema } from '../../shared/schema';
import { audit, getDb } from './db';
import { ensure } from './errors';
import { availableIps, ipNumber } from './allocation';
import { inventory } from './inventory';
import { parseNetConfig } from './machine-network';
import { bridgeOptions } from './pve-options';
import { containerPath, containerExists, pve, type ContainerStatus } from './pve';
import { enqueue } from './provision';
import { networks, resources } from './records';
import { getSettings } from './settings';

export const adjustPayload = (payload: string) => JSON.parse(payload) as {
  spec: Resource['spec']; networks: MachineNetwork[]; confirmShutdown: boolean; resume: boolean;
  specChanged: boolean; diskChanged: boolean; networksChanged: boolean;
};

function sameNetwork(a: MachineNetwork, b: MachineNetwork) {
  return a.iface === b.iface && a.networkId === b.networkId && a.bridge === b.bridge && a.cidr === b.cidr
    && a.ip === b.ip && a.gateway === b.gateway && a.vlan === b.vlan && a.mac === b.mac
    && a.dns.join(',') === b.dns.join(',') && a.name === b.name;
}

export function customNetwork(input: AdjustNetwork, bridges: { iface: string; vlanAware: boolean }[]): MachineNetwork {
  ensure(ipaddr.IPv4.isValidCIDR(input.cidr), 400, '自定义网卡需要有效的 CIDR，例如 192.168.1.0/24');
  const [address, prefix] = ipaddr.IPv4.parseCIDR(input.cidr);
  ensure(prefix >= 8 && prefix <= 30, 400, '子网前缀需在 /8 至 /30 之间');
  const network = ipNumber(ipaddr.IPv4.networkAddressFromCIDR(input.cidr).toString());
  const broadcast = ipNumber(ipaddr.IPv4.broadcastAddressFromCIDR(input.cidr).toString());
  ensure(ipNumber(address.toString()) === network, 400, '自定义 CIDR 必须填写网络地址');
  const bridge = bridges.find(option => option.iface === input.bridge);
  ensure(bridge, 400, '请选择可用的现有网桥或 VNet');
  ensure(!input.vlan || bridge.vlanAware, 400, '所选网桥不支持 VLAN 标签');
  ensure(ipaddr.IPv4.isValid(input.ip), 400, '请填写自定义网卡的内网 IP 地址');
  const ip = ipNumber(input.ip);
  ensure(ip > network && ip < broadcast, 400, 'IP 必须位于自定义子网的有效地址范围内');
  const gateway = input.gateway || null;
  if (gateway) {
    ensure(ipaddr.IPv4.isValid(gateway), 400, '网关地址格式无效');
    const value = ipNumber(gateway);
    ensure(value > network && value < broadcast, 400, '网关必须位于自定义子网内');
    ensure(value !== ip, 400, '网关不能与网卡 IP 相同');
  }
  return { iface: input.iface, networkId: null, name: '自定义 ' + input.bridge, bridge: input.bridge, cidr: input.cidr, ip: input.ip, gateway, dns: input.dns, vlan: input.vlan, mac: null };
}

interface ResolvedAdjust { spec: Resource['spec']; networks: MachineNetwork[]; specChanged: boolean; diskChanged: boolean; networksChanged: boolean }

export async function resolveAdjust(resource: Resource, input: MachineAdjust): Promise<ResolvedAdjust> {
  const snapshot = await inventory(), settings = getSettings(), all = networks();
  const bridges = input.networks.some(entry => !entry.networkId) ? await bridgeOptions() : [];
  // Occupancy excludes this machine: its own addresses are replaced by the adjustment.
  const occupied = new Set<string>();
  for (const other of resources()) if (other.id !== resource.id) for (const entry of other.networks) occupied.add(entry.ip);
  for (const iface of snapshot.interfaces) if (iface.address) occupied.add(iface.address);
  for (const guest of snapshot.configs) {
    if (guest.vmid === resource.vmid) continue;
    for (const [key, value] of Object.entries(guest.config)) {
      if (/^net\d+$/.test(key) && typeof value === 'string') {
        const address = value.match(/(?:^|,)ip=(\d+\.\d+\.\d+\.\d+)\//)?.[1];
        if (address) occupied.add(address);
      }
    }
  }
  const chosen = new Set<string>();
  const resolved = input.networks.map((entry, index): MachineNetwork => {
    const current = resource.networks.find(item => item.iface === entry.iface);
    const mac = entry.macMode === 'set' ? (ensure(entry.mac, 400, '请填写要设置的 MAC 地址'), entry.mac!.toUpperCase()) : entry.macMode === 'keep' ? current?.mac || null : null;
    if (!entry.networkId) return { ...customNetwork(entry, bridges), mac };
    const network = all.find(item => item.id === entry.networkId);
    ensure(network?.ready && !network.error, 409, '网络尚未应用或需要处理错误');
    const pool = availableIps(network);
    let ip = current?.networkId === network.id && pool.includes(current.ip) ? current.ip : '';
    if (!ip || occupied.has(ip) || chosen.has(ip)) {
      const list = pool.filter(candidate => !occupied.has(candidate) && !chosen.has(candidate));
      ensure(list.length, 409, '网络 ' + network.name + ' 已无可用地址');
      ip = list[0];
    }
    ensure(!occupied.has(ip), 409, '地址 ' + ip + ' 已被其他机器或宿主占用');
    chosen.add(ip);
    return {
      iface: entry.iface, networkId: network.id, name: network.name, bridge: network.bridge, cidr: network.cidr,
      ip, gateway: index === 0 ? network.gateway : null, dns: index === 0 ? network.dns : [], vlan: network.vlan, mac,
    };
  });
  const macs = resolved.filter(entry => entry.mac).map(entry => entry.mac);
  ensure(new Set(macs).size === macs.length, 400, '同一台机器的 MAC 地址不能重复');
  const storage = snapshot.entries.find(entry => entry.type === 'storage' && entry.storage === resource.spec.storage && entry.node === settings.pveNode);
  ensure(storage?.status === 'available', 409, '系统盘存储不可用');
  ensure(input.spec.disk >= resource.spec.disk, 409, '系统盘只能扩容，不能缩小');
  const freeDisk = ((storage.maxdisk ?? 0) - (storage.disk ?? 0)) / 1073741824;
  ensure(input.spec.disk - resource.spec.disk <= freeDisk - settings.reserveDisk, 409, '系统盘扩容超出存储可用空间');
  const spec = { ...resource.spec, ...input.spec };
  return {
    spec, networks: resolved,
    specChanged: spec.cores !== resource.spec.cores || spec.memory !== resource.spec.memory || spec.swap !== resource.spec.swap,
    diskChanged: spec.disk !== resource.spec.disk,
    networksChanged: resolved.length !== resource.networks.length || resolved.some((entry, index) => { const before = resource.networks[index]; return !before || !sameNetwork(entry, before); }),
  };
}

export function verifyInterfaces(config: Record<string, unknown>, previous: MachineNetwork[], target: MachineNetwork[]) {
  const stored = target.map(entry => {
    const raw = config['net' + entry.iface.replace(/^eth/, '')];
    ensure(typeof raw === 'string', 409, 'PVE 未按预期设置 ' + entry.iface);
    const parsed = parseNetConfig(raw);
    ensure(parsed.ip === entry.ip && parsed.bridge === entry.bridge && parsed.cidr === entry.cidr, 409, entry.iface + ' 的 PVE 配置与提交结果不一致，请核对后重试');
    ensure(!entry.mac || parsed.mac === entry.mac.toUpperCase(), 409, entry.iface + ' 的 MAC 地址未生效，请核对后重试');
    return { ...entry, mac: parsed.mac };
  });
  for (const entry of previous) ensure(target.some(item => item.iface === entry.iface) || config['net' + entry.iface.replace(/^eth/, '')] === undefined, 409, '网卡 ' + entry.iface + ' 仍然存在于 PVE 配置中，请核对后重试');
  return stored;
}

export async function adjustResource(user: Actor, id: string, input: unknown) {
  ensure(user.role === 'admin', 403, '仅管理员可调整机器配置');
  const resource = resources().find(item => item.id === id);
  ensure(resource, 404, '资源不存在');
  const request = machineAdjustSchema.parse(input);
  ensure(!['creating', 'configuring', 'deleting'].includes(resource.state), 409, '机器正在执行其他生命周期操作，请稍后再调整');
  const resolved = await resolveAdjust(resource, request);
  ensure(resolved.specChanged || resolved.diskChanged || resolved.networksChanged, 400, '没有需要应用的变更');
  const exists = await containerExists(resource.vmid);
  const status = exists ? await pve<ContainerStatus>(containerPath(resource.vmid) + '/status/current') : null;
  const running = status?.status === 'running';
  ensure(!(running && resolved.networksChanged) || request.confirmShutdown, 409, '调整网络需要先关机，请确认停机调整');
  const detail = JSON.stringify({ networks: resolved.networksChanged, spec: resolved.specChanged || resolved.diskChanged });
  const active = getDb().prepare("SELECT id FROM jobs WHERE resource_id=? AND state IN ('queued','running','attention')").get(resource.id) as { id: string } | undefined;
  if (!exists && !active) {
    getDb().prepare('UPDATE resources SET spec=?,networks=? WHERE id=?').run(JSON.stringify(resolved.spec), JSON.stringify(resolved.networks), resource.id);
    audit(user.sub, 'resource.adjust', resource.id, detail);
    return { applied: true };
  }
  const task = enqueue('adjust', resource.studentId, resource.id, {
    spec: resolved.spec, networks: resolved.networks, confirmShutdown: request.confirmShutdown, resume: running,
    specChanged: resolved.specChanged, diskChanged: resolved.diskChanged, networksChanged: resolved.networksChanged,
  });
  audit(user.sub, 'resource.adjust', resource.id, detail);
  return task;
}
