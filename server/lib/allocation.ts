import ipaddr from 'ipaddr.js';
import type { Capacity, NetworkSpec, Profile, ProfileSpec, Settings } from '../../shared/schema';
import { ensure } from './errors';

export const ipNumber = (ip: string) => ipaddr.IPv4.parse(ip).octets.reduce((v, octet) => v * 256 + octet, 0);
export const numberIp = (value: number) => [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.');
export function validateNetwork(spec: NetworkSpec) {
  ensure(ipaddr.IPv4.isValidCIDR(spec.cidr), 400, 'IPv4 CIDR 格式无效');
  const [address, prefix] = ipaddr.IPv4.parseCIDR(spec.cidr);
  ensure(prefix >= 8 && prefix <= 30, 400, '子网前缀需在 /8 至 /30 之间');
  const network = ipNumber(ipaddr.IPv4.networkAddressFromCIDR(spec.cidr).toString());
  const broadcast = ipNumber(ipaddr.IPv4.broadcastAddressFromCIDR(spec.cidr).toString());
  ensure(ipNumber(address.toString()) === network, 400, 'CIDR 必须填写网络地址');
  const start = ipNumber(spec.start), end = ipNumber(spec.end), gateway = ipNumber(spec.gateway);
  ensure(start > network && end < broadcast && start <= end, 400, 'IP 范围必须位于子网有效地址范围内');
  ensure(end - start < 65536, 400, '单个地址池最多包含 65536 个地址');
  ensure(gateway > network && gateway < broadcast, 400, '网关必须位于子网内');
  ensure(spec.excluded.every(ip => ipNumber(ip) >= start && ipNumber(ip) <= end), 400, '排除地址必须位于分配范围内');
  if (spec.mode === 'nat') {
    ensure(address.range() === 'private', 400, 'NAT 网络必须使用 RFC1918 私有地址');
    ensure(/^[a-zA-Z][a-zA-Z0-9]{1,7}$/.test(spec.bridge), 400, 'NAT VNet 名称需为 2–8 位字母或数字，并以字母开头');
    ensure(spec.vlan === null, 400, 'NAT 网络不使用 VLAN');
  }
}
export function availableIps(network: NetworkSpec, occupied: Iterable<string> = []): string[] {
  validateNetwork(network);
  const reserved = new Set([network.gateway, ...network.excluded, ...occupied]);
  const result: string[] = [];
  for (let value = ipNumber(network.start); value <= ipNumber(network.end); value++) {
    const ip = numberIp(value);
    if (!reserved.has(ip)) result.push(ip);
  }
  return result;
}
export function selectProfile(all: Profile[], assigned: string | null, selected: string | undefined, settings: Pick<Settings, 'defaultProfileId' | 'selfSelection'>): Profile {
  const id = assigned || (settings.selfSelection ? selected : undefined) || settings.defaultProfileId;
  const profile = all.find(p => p.id === id);
  ensure(profile?.enabled, 409, '分配配置不存在或已停用');
  if (!assigned) ensure(profile.published, 409, '所选配置尚未发布');
  return profile;
}
export interface Budget { cpu: number; memory: number; disk: number; freeDisk: number; ips: number; vmids: number }
export function calculateCapacity(profile: Pick<ProfileSpec, 'cores' | 'memory' | 'disk'>, budget: Budget): Capacity {
  const limits = {
    cpu: Math.max(0, Math.floor(budget.cpu / profile.cores)),
    memory: Math.max(0, Math.floor(budget.memory / profile.memory)),
    disk: Math.max(0, Math.floor(Math.min(budget.disk, budget.freeDisk) / profile.disk)),
    ip: Math.max(0, budget.ips), vmid: Math.max(0, budget.vmids),
  };
  const count = Math.min(...Object.values(limits));
  return { count, limits, limiting: Object.keys(limits).filter(k => limits[k as keyof typeof limits] === count) };
}
