import { describe, expect, it } from 'vitest';
import {
  adjustNetworks,
  appendDraft,
  draftIssues,
  draftsFrom,
  moveDraft,
  networksChanged,
  removeDraft,
} from '../src/lib/machine-adjust';
import type { MachineNetwork } from '../shared/schema';

const pooled: MachineNetwork = {
  iface: 'eth0',
  networkId: 'lab',
  name: '实验 NAT',
  bridge: 'dclab',
  cidr: '172.31.40.0/24',
  ip: '172.31.40.10',
  gateway: '172.31.40.1',
  dns: ['223.5.5.5', '1.1.1.1'],
  vlan: null,
  mac: 'BC:24:11:00:00:01',
};
const custom: MachineNetwork = {
  iface: 'eth1',
  networkId: null,
  name: '自定义 vmbr1',
  bridge: 'vmbr1',
  cidr: '192.168.10.0/24',
  ip: '192.168.10.20',
  gateway: null,
  dns: [],
  vlan: 20,
  mac: null,
};
const machine = [pooled, custom];

describe('draftsFrom', () => {
  it('keeps the current MAC and carries gateway and DNS only on the primary NIC', () => {
    const [primary, secondary] = draftsFrom(machine);
    expect(primary).toMatchObject({
      source: 'existing',
      networkId: 'lab',
      gateway: '172.31.40.1',
      dns: '223.5.5.5, 1.1.1.1',
      macMode: 'keep',
      mac: 'BC:24:11:00:00:01',
    });
    expect(secondary).toMatchObject({ source: 'custom', networkId: '', gateway: '', dns: '', vlan: '20', mac: '' });
  });

  it('round-trips to an unchanged request', () => {
    const drafts = draftsFrom(machine);
    expect(networksChanged(machine, drafts)).toBe(false);
    expect(adjustNetworks(drafts)).toEqual([
      {
        iface: 'eth0',
        networkId: 'lab',
        bridge: 'dclab',
        cidr: '172.31.40.0/24',
        ip: '172.31.40.10',
        gateway: '172.31.40.1',
        dns: ['223.5.5.5', '1.1.1.1'],
        vlan: null,
        macMode: 'keep',
        mac: null,
      },
      {
        iface: 'eth1',
        networkId: null,
        bridge: 'vmbr1',
        cidr: '192.168.10.0/24',
        ip: '192.168.10.20',
        gateway: '',
        dns: [],
        vlan: 20,
        macMode: 'keep',
        mac: null,
      },
    ]);
  });
});

describe('list edits', () => {
  it('renames NICs by position after moving or removing, without mutating the input', () => {
    const drafts = draftsFrom(machine);
    const moved = moveDraft(drafts, 1, -1);
    expect(moved.map(draft => [draft.iface, draft.bridge])).toEqual([
      ['eth0', 'vmbr1'],
      ['eth1', 'dclab'],
    ]);
    expect(drafts.map(draft => draft.iface)).toEqual(['eth0', 'eth1']);
    expect(removeDraft(drafts, 0).map(draft => [draft.iface, draft.bridge])).toEqual([['eth0', 'vmbr1']]);
  });

  it('appends an empty pooled NIC named after its position', () => {
    const added = appendDraft(draftsFrom(machine));
    expect(added[2]).toMatchObject({ iface: 'eth2', source: 'existing', networkId: '', macMode: 'keep' });
    expect(draftIssues(added, ['vmbr1'])).toEqual(['第 3 块网卡（eth2）未选择网络配置']);
  });
});

describe('draftIssues', () => {
  it('checks custom NIC fields only once bridge options are known', () => {
    const drafts = draftsFrom(machine).map(draft =>
      draft.source === 'custom' ? { ...draft, bridge: 'gone', cidr: '192.168.10.0', ip: '' } : draft,
    );
    expect(draftIssues(drafts, undefined)).toEqual([]);
    expect(draftIssues(drafts, ['vmbr1'])).toEqual([
      '第 2 块网卡（eth1）请选择可用网桥',
      '第 2 块网卡（eth1）需要子网 CIDR',
      '第 2 块网卡（eth1）需要 IP 地址',
    ]);
  });

  it('rejects a malformed MAC only when one is being set', () => {
    const [primary] = draftsFrom(machine);
    expect(draftIssues([{ ...primary, mac: 'bad' }], [])).toEqual([]);
    expect(draftIssues([{ ...primary, macMode: 'set', mac: 'bad' }], [])).toEqual([
      '第 1 块网卡（eth0）的 MAC 地址格式无效',
    ]);
    expect(draftIssues([{ ...primary, macMode: 'set', mac: 'bc:24:11:00:00:02' }], [])).toEqual([]);
  });
});

describe('networksChanged', () => {
  const [primary, secondary] = draftsFrom(machine);

  it('detects added, removed and reordered NICs', () => {
    expect(networksChanged(machine, appendDraft([primary, secondary]))).toBe(true);
    expect(networksChanged(machine, [primary])).toBe(true);
    expect(networksChanged(machine, moveDraft([primary, secondary], 1, -1))).toBe(true);
  });

  it('detects a pooled NIC moving to another network or getting a different MAC', () => {
    expect(networksChanged(machine, [{ ...primary, networkId: 'campus' }, secondary])).toBe(true);
    expect(networksChanged(machine, [{ ...primary, macMode: 'auto' }, secondary])).toBe(true);
    expect(networksChanged(machine, [{ ...primary, macMode: 'set', mac: 'bc:24:11:00:00:01' }, secondary])).toBe(false);
    expect(networksChanged(machine, [{ ...primary, macMode: 'set', mac: 'BC:24:11:00:00:02' }, secondary])).toBe(true);
  });

  it('detects edits to a custom NIC', () => {
    expect(networksChanged(machine, [primary, { ...secondary, ip: '192.168.10.21' }])).toBe(true);
    expect(networksChanged(machine, [primary, { ...secondary, vlan: '' }])).toBe(true);
    expect(networksChanged(machine, [primary, { ...secondary, source: 'existing', networkId: 'lab' }])).toBe(true);
  });

  // The server compares every resolved field (sameNetwork in server/lib/adjust.ts), so these must ask
  // for the shutdown confirmation too, or a running machine's save is rejected with 409.
  it('treats a custom NIC subnet or MAC change as a network change like the server does', () => {
    expect(networksChanged(machine, [primary, { ...secondary, cidr: '192.168.10.0/25' }])).toBe(true);
    expect(networksChanged(machine, [primary, { ...secondary, macMode: 'set', mac: '{{MAC_6ixglbre}}' }])).toBe(true);
    expect(networksChanged(machine, [primary, { ...secondary, macMode: 'auto' }])).toBe(false);
  });
});
