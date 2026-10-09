import ipaddr from 'ipaddr.js';
import { getDb, meta } from './db';
import { networks, resources } from './records';
import { nodePath, pve, type PveNetwork } from './pve';
import { ensure } from './errors';
import { validateNetwork } from './allocation';
import { getSettings } from './settings';
import { inventory } from './inventory';
import { helper } from './helper';

async function acquireLock(jobId: string) {
  const row = getDb().prepare('SELECT payload FROM jobs WHERE id=?').get(jobId) as { payload: string };
  const previous = JSON.parse(row.payload).sdnLock as string | undefined;
  const state = await helper<{ locked: boolean; owned: boolean }>({ operation: 'sdn-lock', token: previous });
  ensure(!state.locked || state.owned, 409, '其他操作持有 PVE SDN 配置锁，请等待其完成');
  if (state.owned) await pve('/cluster/sdn/rollback', 'POST', { 'lock-token': previous, 'release-lock': 1 });
  const token = await pve<string>('/cluster/sdn/lock', 'POST');
  getDb().prepare("UPDATE jobs SET payload=json_set(payload,'$.sdnLock',?) WHERE id=?").run(token, jobId);
  return token;
}
async function rollbackOwnedLock(token: string) {
  const state = await helper<{ owned: boolean }>({ operation: 'sdn-lock', token });
  if (state.owned) await pve('/cluster/sdn/rollback', 'POST', { 'lock-token': token, 'release-lock': 1 });
  return state.owned;
}

export async function applyNetwork(id: string, jobId: string) {
  const network = networks().find(n => n.id === id);
  ensure(network, 404, '网络不存在'); validateNetwork(network);
  const interfaces = await pve<PveNetwork[]>(nodePath() + '/network', 'GET', network.mode === 'bridge' ? { type: 'any_bridge' } : undefined);
  if (network.mode === 'bridge') {
    ensure(interfaces.some(n => n.iface === network.bridge && ['bridge', 'OVSBridge', 'vnet'].includes(n.type)), 400, '所选网桥不存在');
    ensure(!interfaces.some(n => n.address && (n.address === network.start || n.address === network.end)), 400, '地址池边界不能为宿主 IP');
  } else {
    const subnet = ipaddr.IPv4.parseCIDR(network.cidr);
    for (const iface of interfaces) {
      if (iface.iface === network.bridge || !iface.cidr) continue;
      const other = ipaddr.IPv4.parseCIDR(iface.cidr);
      ensure(!subnet[0].match(other) && !other[0].match(subnet), 409, 'NAT 子网与宿主已有网络重叠');
    }
    const zone = 'dc' + meta('instance_id')!.replaceAll('-', '').slice(0, 6);
    const lock = await acquireLock(jobId);
    try {
      const zones = await pve<{ zone: string }[]>('/cluster/sdn/zones');
      if (!zones.some(z => z.zone === zone)) await pve('/cluster/sdn/zones', 'POST', { zone, type: 'simple', nodes: getSettings().pveNode, 'lock-token': lock });
      const vnets = await pve<{ vnet: string; zone: string }[]>('/cluster/sdn/vnets');
      const existing = vnets.find(v => v.vnet === network.bridge);
      ensure(!existing || existing.zone === zone, 409, 'VNet 属于其他 SDN 区域');
      if (!existing) await pve('/cluster/sdn/vnets', 'POST', { vnet: network.bridge, zone, alias: 'PVE Distribution Center', 'lock-token': lock });
      const path = '/cluster/sdn/vnets/' + network.bridge + '/subnets';
      const subnets = await pve<{ subnet: string; cidr?: string }[]>(path);
      if (!subnets.length) await pve(path, 'POST', { subnet: network.cidr, type: 'subnet', gateway: network.gateway, snat: 1, 'lock-token': lock });
      return await pve<string>('/cluster/sdn', 'PUT', { 'lock-token': lock, 'release-lock': 1 });
    } catch (error) {
      try { if (await rollbackOwnedLock(lock)) getDb().prepare("UPDATE jobs SET payload=json_remove(payload,'$.sdnLock') WHERE id=?").run(jobId); } catch { /* Retain the token for recovery; never roll back somebody else's changes. */ }
      throw error;
    }
  }
  return undefined;
}

export async function removeNetwork(id: string, jobId: string) {
  const network = networks().find(n => n.id === id);
  ensure(network && !resources().some(r => r.networkId === id), 409, '网络不存在或仍有资源使用');
  if (network.mode === 'nat') {
    const guests = (await inventory()).configs;
    ensure(!guests.some(g => Object.entries(g.config).some(([key, value]) => /^net\d+$/.test(key) && typeof value === 'string' && value.split(',').includes('bridge=' + network.bridge))), 409, 'PVE 中仍有容器或虚拟机连接此网络');
    const lock = await acquireLock(jobId);
    try {
      const vnets = await pve<{ vnet: string; zone: string }[]>('/cluster/sdn/vnets');
      const current = vnets.find(v => v.vnet === network.bridge);
      if (!current) { await pve('/cluster/sdn/lock', 'DELETE', { 'lock-token': lock }); return undefined; }
      const ownedZone = 'dc' + meta('instance_id')!.replaceAll('-', '').slice(0, 6);
      ensure(current.zone === ownedZone, 409, '不能删除其他 SDN 区域中的网络');
      const path = '/cluster/sdn/vnets/' + network.bridge + '/subnets';
      const subnets = await pve<{ subnet: string }[]>(path);
      for (const subnet of subnets) await pve(path + '/' + encodeURIComponent(subnet.subnet), 'DELETE', { 'lock-token': lock });
      await pve('/cluster/sdn/vnets/' + network.bridge, 'DELETE', { 'lock-token': lock });
      return await pve<string>('/cluster/sdn', 'PUT', { 'lock-token': lock, 'release-lock': 1 });
    } catch (error) {
      try { if (await rollbackOwnedLock(lock)) getDb().prepare("UPDATE jobs SET payload=json_remove(payload,'$.sdnLock') WHERE id=?").run(jobId); } catch { /* Retain the token for recovery. */ }
      throw error;
    }
  }
  return undefined;
}
