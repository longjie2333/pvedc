import type { AdjustNetwork, MachineNetwork } from '../../shared/schema';

export type MacMode = AdjustNetwork['macMode'];
/** Editable form state of one NIC in the adjust dialog; every field is the raw input string. */
export interface NicDraft {
  iface: string;
  source: 'existing' | 'custom';
  networkId: string;
  bridge: string;
  cidr: string;
  ip: string;
  gateway: string;
  dns: string;
  vlan: string;
  macMode: MacMode;
  mac: string;
}

const macPattern = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
const addresses = (value: string) => value.split(/[\s,]+/).filter(Boolean);
/** NIC names follow list order: eth0 is the primary NIC. */
const renumber = (drafts: NicDraft[]) => drafts.map((draft, index) => ({ ...draft, iface: 'eth' + index }));

export function draftsFrom(networks: MachineNetwork[]): NicDraft[] {
  return networks.map((entry, index) => ({
    iface: entry.iface,
    source: entry.networkId ? 'existing' : 'custom',
    networkId: entry.networkId || '',
    bridge: entry.bridge,
    cidr: entry.cidr,
    ip: entry.ip,
    gateway: index === 0 ? entry.gateway || '' : '',
    dns: index === 0 ? entry.dns.join(', ') : '',
    vlan: entry.vlan ? String(entry.vlan) : '',
    macMode: 'keep',
    mac: entry.mac || '',
  }));
}

export const appendDraft = (drafts: NicDraft[]): NicDraft[] => [
  ...drafts,
  {
    iface: 'eth' + drafts.length,
    source: 'existing',
    networkId: '',
    bridge: '',
    cidr: '',
    ip: '',
    gateway: '',
    dns: '',
    vlan: '',
    macMode: 'keep',
    mac: '',
  },
];

export function moveDraft(drafts: NicDraft[], index: number, offset: number): NicDraft[] {
  const list = [...drafts],
    target = index + offset;
  [list[index], list[target]] = [list[target], list[index]];
  return renumber(list);
}

export const removeDraft = (drafts: NicDraft[], index: number) =>
  renumber(drafts.filter((_, itemIndex) => itemIndex !== index));

/**
 * Problems that block saving. `bridges` lists the selectable bridge names, or is undefined while the
 * bridge options are not loaded; custom NIC fields are only checked once they are.
 */
export function draftIssues(drafts: NicDraft[], bridges: string[] | undefined): string[] {
  return drafts.flatMap((draft, index) => {
    const issues: string[] = [];
    const label = '第 ' + (index + 1) + ' 块网卡（' + draft.iface + '）';
    if (draft.source === 'existing') {
      if (!draft.networkId) issues.push(label + '未选择网络配置');
    } else if (bridges) {
      if (!bridges.includes(draft.bridge)) issues.push(label + '请选择可用网桥');
      if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(draft.cidr)) issues.push(label + '需要子网 CIDR');
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(draft.ip)) issues.push(label + '需要 IP 地址');
    }
    if (draft.macMode === 'set' && !macPattern.test(draft.mac)) issues.push(label + '的 MAC 地址格式无效');
    return issues;
  });
}

function draftChanged(before: MachineNetwork | undefined, draft: NicDraft) {
  if (!before) return true;
  if (draft.source === 'custom')
    return (
      before.networkId !== null ||
      before.bridge !== draft.bridge ||
      before.ip !== draft.ip ||
      (before.gateway || '') !== draft.gateway ||
      before.dns.join(',') !== addresses(draft.dns).join(',') ||
      (before.vlan ? String(before.vlan) : '') !== draft.vlan
    );
  if (before.networkId !== draft.networkId) return true;
  if (draft.macMode === 'auto') return !!before.mac;
  if (draft.macMode === 'set') return (before.mac || '').toUpperCase() !== draft.mac.toUpperCase();
  return false;
}

/** Whether applying the drafts changes the machine's network; a running machine must then shut down first. */
export const networksChanged = (before: MachineNetwork[], drafts: NicDraft[]) =>
  drafts.length !== before.length || drafts.some((draft, index) => draftChanged(before[index], draft));

/** Request body for the drafts; gateway and DNS apply to the primary NIC only. */
export function adjustNetworks(drafts: NicDraft[]): AdjustNetwork[] {
  return drafts.map((draft, index) => ({
    iface: draft.iface,
    networkId: draft.source === 'existing' ? draft.networkId : null,
    bridge: draft.bridge,
    cidr: draft.cidr,
    ip: draft.ip,
    gateway: index === 0 ? draft.gateway : '',
    dns: index === 0 ? addresses(draft.dns) : [],
    vlan: draft.vlan ? Number(draft.vlan) : null,
    macMode: draft.macMode,
    mac: draft.macMode === 'set' ? draft.mac : null,
  }));
}
