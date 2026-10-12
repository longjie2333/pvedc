import ipaddr from 'ipaddr.js';
import type { GuestConfig } from './pve';
import type { MachineNetwork, Resource } from '../../shared/schema';
import { getDb } from './db';

export const configKey = (iface: string) => 'net' + iface.replace(/^eth/, '');
export function netConfig(entry: MachineNetwork) {
  return [
    'name=' + entry.iface, 'bridge=' + entry.bridge, 'ip=' + entry.ip + '/' + entry.cidr.split('/')[1],
    ...(entry.gateway ? ['gw=' + entry.gateway] : []),
    ...(entry.vlan ? ['tag=' + entry.vlan] : []),
    ...(entry.mac ? ['hwaddr=' + entry.mac.toUpperCase()] : []),
  ].join(',');
}
export function parseNetConfig(value: string) {
  const fields = new Map<string, string>();
  for (const part of value.split(',')) { const [key, ...rest] = part.split('='); if (rest.length) fields.set(key, rest.join('=')); }
  const address = fields.get('ip')?.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
  const vlan = Number(fields.get('tag'));
  const mac = fields.get('hwaddr')?.match(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/);
  let cidr: string | null = null;
  if (address) {
    const prefix = Number(address[2]);
    const network = ipaddr.IPv4.networkAddressFromCIDR(address[1] + '/' + prefix).toString();
    if (ipaddr.IPv4.isValidCIDR(network + '/' + prefix)) cidr = network + '/' + prefix;
  }
  return {
    name: fields.get('name') || 'eth0', bridge: fields.get('bridge') || '', ip: address?.[1] || null, cidr,
    gateway: fields.get('gw') || null, vlan: Number.isInteger(vlan) && vlan > 0 ? vlan : null,
    mac: mac ? mac[0].toUpperCase() : null,
  };
}
export function recordAssignedMacs(resource: Resource, config: GuestConfig) {
  let changed = false;
  const networks = resource.networks.map(entry => {
    const raw = config[configKey(entry.iface)];
    const mac = typeof raw === 'string' ? parseNetConfig(raw).mac : null;
    if (!mac || mac === entry.mac) return entry;
    changed = true;
    return { ...entry, mac };
  });
  if (changed) getDb().prepare('UPDATE resources SET networks=? WHERE id=?').run(JSON.stringify(networks), resource.id);
  return changed;
}
