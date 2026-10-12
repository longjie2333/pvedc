import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { BridgeOption } from '../../shared/pve-options';
import type { Network, Resource } from '../../shared/schema';
import { request, useCommand } from '@/lib/api';
import { Choice, Feedback, Modal, TextField } from '@/components/common';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { SpecCombobox } from '@/components/spec-combobox';

type MacMode = 'keep' | 'set' | 'auto';
interface Row {
  iface: string; source: 'existing' | 'custom'; networkId: string; bridge: string; cidr: string; ip: string;
  gateway: string; dns: string; vlan: string; macMode: MacMode; mac: string;
}
const macPattern = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
const addresses = (value: string) => value.split(/[\s,]+/).filter(Boolean);

function initialRows(resource: Resource): Row[] {
  return resource.networks.map((entry, index) => ({
    iface: entry.iface, source: entry.networkId ? 'existing' : 'custom', networkId: entry.networkId || '',
    bridge: entry.bridge, cidr: entry.cidr, ip: entry.ip, gateway: index === 0 ? entry.gateway || '' : '', dns: index === 0 ? entry.dns.join(', ') : '',
    vlan: entry.vlan ? String(entry.vlan) : '', macMode: 'keep', mac: entry.mac || '',
  }));
}

interface Sample<T> { data: T | null; error: string | null; updatedAt: number | null }

export function ResourceAdjust({ resource, networks, onClose }: { resource: Resource; networks: Network[]; onClose: () => void }) {
  const command = useCommand();
  const [rows, setRows] = useState<Row[]>(() => initialRows(resource));
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<{ cores: string; memory: string; swap: string; disk: string }>();
  const status = useQuery({ queryKey: ['machine-status', resource.id], queryFn: () => request<Sample<{ status: string }>>('admin/resources/' + resource.id + '/status') });
  const running = status.data?.data?.status === 'running';
  const bridges = useQuery({ queryKey: ['pve-options', 'networks'], queryFn: () => request<BridgeOption[]>('admin/options/networks'), enabled: rows.some(row => row.source === 'custom') });
  const bridgeItems = (bridges.data || []).map(bridge => ({ value: bridge.iface, label: bridge.iface + ' · ' + bridge.type + (bridge.address ? ' · ' + bridge.address : '') }));
  const update = (index: number, patch: Partial<Row>) => setRows(previous => previous.map((row, itemIndex) => itemIndex === index ? { ...row, ...patch } : row));
  const move = (index: number, offset: number) => setRows(previous => { const list = [...previous], target = index + offset; [list[index], list[target]] = [list[target], list[index]]; return list.map((row, itemIndex) => ({ ...row, iface: 'eth' + itemIndex })); });
  const reachable = bridges.data !== undefined;

  const errors = useMemo(() => rows.flatMap((row, index) => {
    const issues: string[] = [];
    const label = '第 ' + (index + 1) + ' 块网卡（' + row.iface + '）';
    if (row.source === 'existing') { if (!row.networkId) issues.push(label + '未选择网络配置'); }
    else if (reachable) {
      if (!bridgeItems.some(option => option.value === row.bridge)) issues.push(label + '请选择可用网桥');
      if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(row.cidr)) issues.push(label + '需要子网 CIDR');
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(row.ip)) issues.push(label + '需要 IP 地址');
    }
    if (row.macMode === 'set' && !macPattern.test(row.mac)) issues.push(label + '的 MAC 地址格式无效');
    return issues;
  }), [rows, bridges.data]);

  const networkChanged = (index: number, row: Row) => {
    const before = resource.networks[index];
    if (!before) return true;
    if (row.source === 'custom') return before.networkId !== null || before.bridge !== row.bridge || before.ip !== row.ip
      || (before.gateway || '') !== row.gateway || before.dns.join(',') !== addresses(row.dns).join(',') || (before.vlan ? String(before.vlan) : '') !== row.vlan;
    if (before.networkId !== row.networkId) return true;
    if (row.macMode === 'auto') return !!before.mac;
    if (row.macMode === 'set') return (before.mac || '').toUpperCase() !== row.mac.toUpperCase();
    return false;
  };
  const anyNetworkChange = () => rows.length !== resource.networks.length || rows.some((row, index) => networkChanged(index, row));

  async function submit(confirmShutdown: boolean, values?: { cores: string; memory: string; swap: string; disk: string }) {
    const spec = {
      cores: Number(values?.cores ?? resource.spec.cores), memory: Number(values?.memory ?? resource.spec.memory),
      swap: Number(values?.swap ?? resource.spec.swap), disk: Number(values?.disk ?? resource.spec.disk),
    };
    const payload = rows.map((row, index) => ({
      iface: row.iface, networkId: row.source === 'existing' ? row.networkId : null, bridge: row.bridge, cidr: row.cidr, ip: row.ip,
      gateway: index === 0 ? row.gateway : '', dns: index === 0 ? addresses(row.dns) : [],
      vlan: row.vlan ? Number(row.vlan) : null, macMode: row.macMode, mac: row.macMode === 'set' ? row.mac : null,
    }));
    const result = await command.run('admin/resources/' + resource.id + '/adjust', { spec, networks: payload, confirmShutdown });
    if (result) { setConfirming(false); onClose(); }
  }
  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as { cores: string; memory: string; swap: string; disk: string };
    setDraft(values);
    if (running && anyNetworkChange()) { setConfirming(true); return; }
    void submit(false, values);
  }
  const networkName = (id: string) => networks.find(network => network.id === id)?.name || '已删除网络';

  return <>
    <Modal open={!confirming} onClose={onClose} title="调整机器配置" description={'VMID ' + resource.vmid + ' · ' + resource.studentId + '。修改将应用到现有容器：规格在线生效，网络变更需要先关机。'}
      footer={<Button form="machine-adjust" type="submit" loading={command.pending} disabled={errors.length > 0}>保存并应用</Button>}>
      <Form id="machine-adjust" className="flex flex-col gap-5" onSubmit={submitForm}><Feedback error={command.error}/><Feedback error={bridges.error?.message}/>
        <div className="form-grid">
          <SpecCombobox name="cores" label="CPU 核数" initial={resource.spec.cores} presets={[1, 2, 4, 8, 16]} min={1} max={128}/>
          <SpecCombobox name="memory" label="内存 MiB" initial={resource.spec.memory} presets={[512, 1024, 2048, 4096, 8192, 16384]} min={256} max={1048576}/>
          <SpecCombobox name="swap" label="交换空间 MiB" initial={resource.spec.swap} presets={[0, 512, 1024, 2048]} min={0} max={1048576}/>
          <SpecCombobox name="disk" label="系统盘 GiB（只能扩容）" initial={resource.spec.disk} presets={[8, 16, 32, 64, 128]} min={resource.spec.disk} max={65536}/>
        </div>
        <section className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <div><strong className="text-sm">网络接口</strong><p className="text-xs text-muted-foreground">可改用其他网络配置或自定义网桥配置；第一块网卡承担默认网关与 DNS。</p></div>
            <Button type="button" size="icon-sm" variant="outline" aria-label="添加网卡" disabled={rows.length >= 8} onClick={() => setRows(previous => [...previous, { iface: 'eth' + previous.length, source: 'existing', networkId: '', bridge: '', cidr: '', ip: '', gateway: '', dns: '', vlan: '', macMode: 'keep', mac: '' }])}><Plus/></Button>
          </div>
          <div className="flex flex-col gap-4">
            {rows.map((row, index) => <div key={index} className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{row.iface}</strong><span className="text-xs text-muted-foreground">{index === 0 ? '主网卡' : '第 ' + (index + 1) + ' 块网卡'}</span>
                <div className="w-52"><Choice label="配置方式" value={row.source} onChange={value => update(index, { source: value as Row['source'] })} items={[{ value: 'existing', label: '使用已有网络配置' }, { value: 'custom', label: '自定义配置' }]}/></div>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={'上移 ' + row.iface} disabled={index === 0} onClick={() => move(index, -1)}><ChevronUp/></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={'下移 ' + row.iface} disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ChevronDown/></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={'删除 ' + row.iface} disabled={rows.length <= 1} onClick={() => setRows(previous => previous.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, iface: 'eth' + itemIndex })))}><Trash2/></Button>
              </div>
              {row.source === 'existing' ? <Choice label="网络配置" value={row.networkId} onChange={value => update(index, { networkId: value })} items={[{ value: '', label: '请选择' }, ...networks.map(network => ({ value: network.id, label: network.name + (network.ready ? '' : '（待应用）') }))]}/> : <div className="form-grid">
                <div className="inline-field-action"><Choice label="网桥 / VNet" value={row.bridge} onChange={value => update(index, { bridge: value })} items={[{ value: '', label: '请选择' }, ...bridgeItems]}/><Button type="button" size="icon" variant="outline" aria-label="刷新网桥选项" title="刷新网桥选项" loading={bridges.isFetching} onClick={() => void bridges.refetch()}><RefreshCw/></Button></div>
                <TextField label="子网 CIDR" value={row.cidr} onChange={event => update(index, { cidr: event.target.value })} placeholder="192.168.10.0/24" required/>
                <TextField label="IP 地址" value={row.ip} onChange={event => update(index, { ip: event.target.value })} placeholder="192.168.10.20" required/>
                <TextField label={index === 0 ? '网关' : '网关（由第一块网卡承担）'} value={row.gateway} onChange={event => update(index, { gateway: event.target.value })} disabled={index !== 0} placeholder={index === 0 ? '192.168.10.1' : undefined}/>
                <TextField label={index === 0 ? 'DNS（逗号分隔）' : 'DNS（由第一块网卡承担）'} value={row.dns} onChange={event => update(index, { dns: event.target.value })} disabled={index !== 0} placeholder={index === 0 ? '223.5.5.5' : undefined}/>
                <TextField label="VLAN（可留空）" type="number" value={row.vlan} onChange={event => update(index, { vlan: event.target.value })}/>
              </div>}
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-56"><Choice label="MAC 地址" value={row.macMode} onChange={value => update(index, { macMode: value as MacMode })} items={[{ value: 'keep', label: '保持当前 MAC' }, { value: 'set', label: '指定新 MAC' }, { value: 'auto', label: '留空由 PVE 自动分配' }]}/></div>
                {row.macMode === 'set' && <TextField label="新 MAC 地址" value={row.mac} onChange={event => update(index, { mac: event.target.value })} placeholder="AA:BB:CC:DD:EE:FF" required/>}
                <small className="text-xs text-muted-foreground">{row.source === 'existing' ? (row.networkId ? '使用 ' + networkName(row.networkId) + ' 的地址池；未移动的网卡保留当前地址' : '请选择网络配置') : '自定义配置不占用地址池'}</small>
              </div>
            </div>)}
          </div>
        </section>
        {errors.length > 0 && <div className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"><ul className="m-0 flex flex-col gap-1 pl-5">{errors.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      </Form>
    </Modal>
    <Modal destructive open={confirming} onClose={() => setConfirming(false)} title="调整网络需要先关机" description="容器正在运行。平台将先执行优雅关机，应用网络与规格变更，然后自动重新启动容器；请确认可以中断服务。"
      footer={<Button variant="destructive" loading={command.pending} onClick={() => void submit(true, draft)}>关机并应用调整</Button>}>
      <Feedback error={command.error}/>
      <p className="text-sm">将调整 {rows.length} 块网卡：{rows.map(row => row.source === 'existing' ? networkName(row.networkId) : '自定义 ' + (row.bridge || '未选择网桥')).join('、')}。</p>
    </Modal>
  </>;
}
