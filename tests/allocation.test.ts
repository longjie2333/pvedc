import { describe, expect, it } from 'vitest';
import { availableIps, calculateCapacity, selectProfile, validateNetwork } from '../server/lib/allocation';
import { settingsSchema, type NetworkSpec, type Profile } from '../shared/schema';

const network: NetworkSpec = { name: 'test', mode: 'nat', bridge: 'dctest', cidr: '172.20.0.0/24', gateway: '172.20.0.1', start: '172.20.0.1', end: '172.20.0.5', dns: ['1.1.1.1'], excluded: ['172.20.0.4'], vlan: null };
const base: Profile = { id: 'default', name: 'default', enabled: true, published: true, cores: 2, memory: 2048, swap: 0, disk: 8, template: 'local:vztmpl/ubuntu-test.tar.zst', distro: 'ubuntu', storage: 'local-lvm', networkId: 'network', nesting: false, initialForwards: [] };
describe('allocation policy', () => {
  const all = [base, { ...base, id: 'assigned', published: false }, { ...base, id: 'chosen' }, { ...base, id: 'disabled', enabled: false }];
  it('locks an administrator assignment even in self selection mode', () => {
    expect(selectProfile(all, 'assigned', 'chosen', { selfSelection: true, defaultProfileId: 'default' }).id).toBe('assigned');
  });
  it('ignores student selection in automatic mode', () => {
    expect(selectProfile(all, null, 'chosen', { selfSelection: false, defaultProfileId: 'default' }).id).toBe('default');
  });
  it('uses published selection or mandatory default', () => {
    expect(selectProfile(all, null, 'chosen', { selfSelection: true, defaultProfileId: 'default' }).id).toBe('chosen');
    expect(selectProfile(all, null, undefined, { selfSelection: true, defaultProfileId: 'default' }).id).toBe('default');
    expect(() => selectProfile(all, null, 'assigned', { selfSelection: true, defaultProfileId: 'default' })).toThrow('尚未发布');
  });
  it('never substitutes a disabled assignment', () => {
    expect(() => selectProfile(all, 'disabled', undefined, { selfSelection: false, defaultProfileId: 'default' })).toThrow('停用');
  });
});
describe('IPv4 allocation', () => {
  it('excludes gateway, excluded addresses and leases', () => expect(availableIps(network, ['172.20.0.2'])).toEqual(['172.20.0.3', '172.20.0.5']));
  it('rejects network and broadcast addresses and reversed ranges', () => {
    expect(() => validateNetwork({ ...network, start: '172.20.0.0' })).toThrow();
    expect(() => validateNetwork({ ...network, end: '172.20.0.255' })).toThrow();
    expect(() => validateNetwork({ ...network, end: '172.19.0.1' })).toThrow();
  });
  it('rejects noncanonical CIDR and public NAT subnets', () => {
    expect(() => validateNetwork({ ...network, cidr: '172.20.0.1/24' })).toThrow('网络地址');
    expect(() => validateNetwork({ ...network, cidr: '8.8.8.0/24', gateway: '8.8.8.1', start: '8.8.8.2', end: '8.8.8.5', excluded: [] })).toThrow('私有');
  });
});
describe('capacity', () => {
  it('uses the most constrained resource and actual disk free space', () => {
    const capacity = calculateCapacity(base, { cpu: 20, memory: 32768, disk: 160, freeDisk: 17, ips: 50, vmids: 100 });
    expect(capacity.count).toBe(2); expect(capacity.limiting).toEqual(['disk']);
  });
  it('clamps exhausted budgets to zero', () => expect(calculateCapacity(base, { cpu: -1, memory: -20, disk: 50, freeDisk: 50, ips: 1, vmids: 1 }).count).toBe(0));
  it('rejects reversed port and VMID ranges', () => {
    expect(settingsSchema.safeParse({ portStart: 40000, portEnd: 20000 }).success).toBe(false);
    expect(settingsSchema.safeParse({ vmidStart: 2000, vmidEnd: 1000 }).success).toBe(false);
  });
});
