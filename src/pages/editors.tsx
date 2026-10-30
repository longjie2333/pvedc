import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { AdminStudent, Network, Profile } from '../../shared/schema';
import type { BridgeOption, StorageOption, TemplateOption } from '../../shared/pve-options';
import { request, useCommand } from '@/lib/api';
import { Choice, Feedback, FormSection, Modal, TextField } from '@/components/common';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { SpecCombobox } from '@/components/spec-combobox';
import { SwitchSetting } from '@/components/switch-setting';
import { Input } from '@/components/ui/input';

type InitialForwardDraft = { protocol: 'tcp' | 'udp'; targetPort: string; publicPort: string; note: string };

export function CatalogEditor({ kind, item, profiles, networks, onClose }: { kind: 'students' | 'profiles' | 'networks'; item?: AdminStudent | Profile | Network; profiles: Profile[]; networks: Network[]; onClose: () => void }) {
  const command = useCommand();
  const initial = item as unknown as Record<string, unknown> | undefined;
  const [choice, setChoice] = useState({ profileId: String(initial?.profileId || ''), networkIds: Array.isArray(initial?.networkIds) ? (initial.networkIds as string[]) : networks[0]?.id ? [networks[0].id] : [], mode: String(initial?.mode || 'nat'), distro: String(initial?.distro || 'ubuntu'), template: String(initial?.template || ''), storage: String(initial?.storage || ''), bridge: String(initial?.bridge || '') });
  const [flags, setFlags] = useState({ enabled: initial?.enabled !== false, published: !!initial?.published, nesting: !!initial?.nesting });
  const [initialForwards, setInitialForwards] = useState<InitialForwardDraft[]>(() => Array.isArray(initial?.initialForwards) ? (initial.initialForwards as { protocol: 'tcp' | 'udp'; targetPort: number; publicPort?: number; note: string }[]).map(forward => ({ protocol: forward.protocol, targetPort: String(forward.targetPort), publicPort: forward.publicPort ? String(forward.publicPort) : '', note: forward.note || '' })) : []);
  const bridges = useQuery({ queryKey: ['pve-options', 'networks'], queryFn: () => request<BridgeOption[]>('admin/options/networks'), enabled: kind === 'networks' && choice.mode === 'bridge' });
  const stores = useQuery({ queryKey: ['pve-options', 'storages'], queryFn: () => request<StorageOption[]>('admin/options/storages'), enabled: kind === 'profiles' });
  const templates = useQuery({ queryKey: ['pve-options', 'templates'], queryFn: () => request<TemplateOption[]>('admin/options/templates'), enabled: kind === 'profiles' });
  const templateItems = (templates.data || []).filter(template => template.distro === choice.distro).map(template => ({ value: template.volid, label: template.volid }));
  const storageItems = (stores.data || []).filter(storage => storage.content.includes('rootdir')).map(storage => ({ value: storage.storage, label: storage.storage + ' · ' + (storage.available / 1073741824).toFixed(1) + ' GiB 可用' }));
  const bridgeItems = (bridges.data || []).map(bridge => ({ value: bridge.iface, label: bridge.iface + ' · ' + bridge.type + (bridge.address ? ' · ' + bridge.address : '') }));
  const validProfile = templateItems.some(item => item.value === choice.template) && storageItems.some(item => item.value === choice.storage);
  const validBridge = bridgeItems.some(item => item.value === choice.bridge);
  const validNetworks = choice.networkIds.length >= 1 && new Set(choice.networkIds).size === choice.networkIds.length && choice.networkIds.every(id => networks.some(n => n.id === id));
  const moveNetwork = (index: number, offset: number) => setChoice(previous => { const list = [...previous.networkIds], target = index + offset; [list[index], list[target]] = [list[target], list[index]]; return { ...previous, networkIds: list }; });
  const options = (items: {value: string; label: string}[], value: string) => [{ value: '', label: '请选择' }, ...items, ...(value && !items.some(item => item.value === value) ? [{ value, label: value + '（当前不可用）', disabled: true }] : [])];
  const fields = (name: string, label: string, fallback = '', type = 'text', required = true) => <TextField key={name} label={label} name={name} type={type} defaultValue={String(initial?.[name] ?? fallback)} required={required} disabled={kind === 'students' && name === 'id' && !!item}/>;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget));
    if (kind === 'students') { values.id = item?.id || values.id; values.profileId = choice.profileId || null; values.enabled = flags.enabled; }
    if (kind === 'profiles') Object.assign(values, { ...flags, networkIds: choice.networkIds, distro: choice.distro, template: choice.template, storage: choice.storage, initialForwards: initialForwards.map(forward => ({ protocol: forward.protocol, targetPort: Number(forward.targetPort), publicPort: forward.publicPort ? Number(forward.publicPort) : undefined, note: forward.note })) });
    if (kind === 'networks') {
      values.mode = choice.mode; if (choice.mode === 'bridge') values.bridge = choice.bridge; values.vlan = values.vlan ? Number(values.vlan) : null;
      values.dns = String(values.dns).split(/[\s,]+/).filter(Boolean); values.excluded = String(values.excluded || '').split(/[\s,]+/).filter(Boolean);
    }
    if (await command.run('admin/' + kind + (item && kind !== 'students' ? '/' + item.id : ''), values)) onClose();
  }
  const name = { students: '学生', profiles: '资源配置', networks: '网络与地址池' }[kind];
  const updateForward = (index: number, patch: Partial<InitialForwardDraft>) => setInitialForwards(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return <Modal open onClose={onClose} title={(item ? '编辑' : '添加') + name} description={kind === 'profiles' ? '修改仅影响后续分配，已有容器保留创建时的配置。' : kind === 'networks' ? '保存后点击应用网络，验证并配置实际网络。' : '名单指定的配置优先于默认及学生自选配置。'} footer={<Button form="catalog-editor" type="submit" loading={command.pending} disabled={(kind === 'profiles' && (!validProfile || !validNetworks)) || (kind === 'networks' && choice.mode === 'bridge' && !validBridge)}>保存</Button>}><Form id="catalog-editor" className="flex flex-col gap-5" onSubmit={save}><Feedback error={command.error || bridges.error?.message || stores.error?.message || templates.error?.message}/>
    <div className="flex flex-col divide-y [&>*]:py-5 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
    {kind === 'students' && <div className="form-grid">{fields('id', '学号')}{fields('name', '姓名')}{fields('className', '班级', '', 'text', false)}<TextField label="认领密钥" name="claimKey" defaultValue={String(initial?.claimKey ?? '')} maxLength={64} autoComplete="off" hint="留空表示认领时无需填写密钥。"/><Choice label="指定配置" value={choice.profileId} onChange={v => setChoice({ ...choice, profileId: v })} items={[{ value: '', label: '不指定，遵循平台分配规则' }, ...profiles.map(p => ({ value: p.id, label: p.name }))]}/></div>}
    {kind === 'profiles' && <>
      <FormSection legend="系统" action={<Button type="button" size="icon-sm" variant="ghost" aria-label="刷新 PVE 选项" title="刷新 PVE 选项" loading={templates.isFetching || stores.isFetching} onClick={() => { void stores.refetch(); void templates.refetch(); }}><RefreshCw/></Button>}>
        <div className="form-grid">{fields('name', '配置名称')}<Choice label="发行版" value={choice.distro} onChange={v => setChoice({ ...choice, distro: v, template: '' })} items={[{ value: 'ubuntu', label: 'Ubuntu' }, { value: 'debian', label: 'Debian' }]}/><Choice label="模板卷 ID" value={choice.template} onChange={template => setChoice({ ...choice, template })} items={options(templateItems, choice.template)}/><Choice label="系统盘存储" value={choice.storage} onChange={storage => setChoice({ ...choice, storage })} items={options(storageItems, choice.storage)}/></div>
      </FormSection>
      <FormSection legend="规格">
        <div className="form-grid"><SpecCombobox name="cores" label="CPU 核数" initial={Number(initial?.cores ?? 2)} presets={[1, 2, 4, 8, 16]} min={1} max={128}/><SpecCombobox name="memory" label="内存 MiB" initial={Number(initial?.memory ?? 2048)} presets={[512, 1024, 2048, 4096, 8192, 16384]} min={256} max={1048576}/>{fields('swap', '交换空间 MiB', '0', 'number')}<SpecCombobox name="disk" label="系统盘 GiB" initial={Number(initial?.disk ?? 8)} presets={[8, 16, 32, 64, 128]} min={4} max={65536}/></div>
      </FormSection>
      <FormSection legend="网卡" description="按顺序对应 eth0、eth1……；eth0 承担默认网关、DNS 与公网转发。" action={<Button type="button" size="sm" variant="outline" disabled={choice.networkIds.length >= Math.min(8, networks.length)} onClick={() => setChoice(previous => ({ ...previous, networkIds: [...previous.networkIds, networks.find(n => !previous.networkIds.includes(n.id))?.id || ''] }))}><Plus/>添加网卡</Button>}>
        {choice.networkIds.length ? <div className="flex flex-col gap-2">{choice.networkIds.map((networkId, index) => <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2" key={index}>
          <span aria-hidden="true" className="font-mono text-muted-foreground text-sm">eth{index}</span>
          <Choice hideLabel label={'网卡 eth' + index} value={networkId} onChange={value => setChoice(previous => ({ ...previous, networkIds: previous.networkIds.map((item, itemIndex) => itemIndex === index ? value : item) }))} items={networks.filter(n => n.id === networkId || !choice.networkIds.includes(n.id)).map(n => ({ value: n.id, label: n.name + (n.ready ? '' : '（待应用）') }))}/>
          <div className="flex"><Button type="button" size="icon-sm" variant="ghost" aria-label={'上移 eth' + index} disabled={index === 0} onClick={() => moveNetwork(index, -1)}><ChevronUp/></Button><Button type="button" size="icon-sm" variant="ghost" aria-label={'下移 eth' + index} disabled={index === choice.networkIds.length - 1} onClick={() => moveNetwork(index, 1)}><ChevronDown/></Button><Button type="button" size="icon-sm" variant="ghost" aria-label={'删除 eth' + index} disabled={choice.networkIds.length <= 1} onClick={() => setChoice(previous => ({ ...previous, networkIds: previous.networkIds.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2/></Button></div>
        </div>)}</div> : <p className="text-muted-foreground text-sm">请先创建网络配置。</p>}
      </FormSection>
      <FormSection legend="初始化转发" description="容器创建完成后自动申请公网端口并同步到 gost。" action={<Button type="button" size="sm" variant="outline" onClick={() => setInitialForwards(previous => [...previous, { protocol: 'tcp', targetPort: '', publicPort: '', note: '' }])}><Plus/>添加转发</Button>}>
        {initialForwards.length > 0 && <div className="flex flex-col gap-2">
          <div aria-hidden="true" className="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_2rem] gap-2 text-muted-foreground text-xs max-sm:hidden"><span>协议</span><span>容器端口</span><span>公网端口</span><span>备注</span></div>
          {initialForwards.map((forward, index) => <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-2 sm:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_2rem]" key={index}>
            <Choice hideLabel label={'第 ' + (index + 1) + ' 条转发协议'} value={forward.protocol} onChange={value => updateForward(index, { protocol: value as 'tcp' | 'udp' })} items={[{ value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }]}/>
            <Input aria-label={'第 ' + (index + 1) + ' 条转发容器端口'} type="number" min={1} max={65535} placeholder="容器端口" value={forward.targetPort} onChange={event => updateForward(index, { targetPort: event.target.value })}/>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={'删除第 ' + (index + 1) + ' 条转发'} className="sm:order-last" onClick={() => setInitialForwards(previous => previous.filter((_, itemIndex) => itemIndex !== index))}><Trash2/></Button>
            <Input aria-label={'第 ' + (index + 1) + ' 条转发公网端口'} type="number" min={1} max={65535} placeholder="自动分配" className="max-sm:col-span-2" value={forward.publicPort} onChange={event => updateForward(index, { publicPort: event.target.value })}/>
            <Input aria-label={'第 ' + (index + 1) + ' 条转发备注'} placeholder="备注" className="max-sm:col-span-2" value={forward.note} onChange={event => updateForward(index, { note: event.target.value })}/>
          </div>)}
        </div>}
      </FormSection>
    </>}
    {kind === 'networks' && <>
      <FormSection legend="网络">
        <div className="form-grid">{fields('name', '网络名称')}<Choice label="网络模式" value={choice.mode} onChange={v => setChoice({ ...choice, mode: v, bridge: '' })} items={[{ value: 'nat', label: '独立私网 + NAT' }, { value: 'bridge', label: '桥接现有网络' }]}/>
          {choice.mode === 'nat' ? <p className="col-span-full text-muted-foreground text-sm">VNet <span className="text-foreground">{item && initial?.mode === 'nat' ? String(initial.bridge) : '保存后自动生成'}</span></p> : <div className="inline-field-action"><Choice label="现有网桥" value={choice.bridge} onChange={bridge => setChoice({ ...choice, bridge })} items={options(bridgeItems, choice.bridge)}/><Button type="button" size="icon" variant="outline" aria-label="刷新网桥选项" title="刷新网桥选项" loading={bridges.isFetching} onClick={() => void bridges.refetch()}><RefreshCw/></Button></div>}
          {choice.mode === 'bridge' && bridges.data?.find(bridge => bridge.iface === choice.bridge)?.vlanAware && fields('vlan', 'VLAN（可留空）', '', 'number', false)}</div>
      </FormSection>
      <FormSection legend="地址池">
        <div className="form-grid">{fields('cidr', '子网 CIDR', '172.20.0.0/24')}{fields('gateway', '网关', '172.20.0.1')}{fields('start', '起始 IP', '172.20.0.10')}{fields('end', '结束 IP', '172.20.0.200')}<TextField label="DNS（逗号分隔）" name="dns" required defaultValue={(initial?.dns as string[] | undefined)?.join(', ') || '223.5.5.5, 1.1.1.1'}/><TextField label="排除 IP（逗号分隔）" name="excluded" defaultValue={(initial?.excluded as string[] | undefined)?.join(', ') || ''}/></div>
      </FormSection>
    </>}
    {kind !== 'networks' && <FormSection legend="选项"><div className="grid gap-3"><SwitchSetting label="启用" description={kind === 'students' ? '允许此学生登录和认领资源。' : '允许此规格用于后续资源分配。'} checked={flags.enabled} onChange={v => setFlags({ ...flags, enabled: v })}/>{kind === 'profiles' && <><SwitchSetting label="公开发布" description="将此规格加入学生可选配置。" checked={flags.published} onChange={v => setFlags({ ...flags, published: v })}/><SwitchSetting label="允许容器嵌套" description="允许容器内运行 Docker 等嵌套工作负载。" checked={flags.nesting} onChange={v => setFlags({ ...flags, nesting: v })}/></>}</div></FormSection>}
    </div>
  </Form></Modal>;
}
