import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ipaddr from 'ipaddr.js';
import { Plus, RefreshCw } from 'lucide-react';
import type { Forward, ListeningPort, Resource } from '../../shared/schema';
import type { Sample } from '../../shared/metrics';
import { request, useCommand } from '@/lib/api';
import { Choice, Empty, Feedback, Modal, Panel, Status, TextField } from './common';
import { Field, FieldLabel } from './ui/field';
import { Form } from './ui/form';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from './ui/select';

interface PortChoice { value: string; label: string; description: string; target?: ListeningPort; disabled?: boolean }
const manual: PortChoice = { value: 'manual', label: '手动指定端口', description: '也可为尚未启动的服务提前配置转发' };

export function ForwardPanel({ rules, resource, publicHost, admin = false }: { rules: Forward[]; resource?: Resource; publicHost: string; admin?: boolean }) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState('');
  const [protocol, setProtocol] = useState('tcp'), [targetPort, setTargetPort] = useState('');
  const command = useCommand(), prefix = admin ? 'admin' : 'me';
  const ports = useQuery({ queryKey: ['forward-ports', resource?.id], queryFn: () => request<Sample<ListeningPort[]>>('me/ports'),
    enabled: !admin && open && resource?.state === 'ready', refetchInterval: open && !admin ? 15000 : false });
  const options = useMemo<PortChoice[]>(() => [...(ports.data?.data || []).map(target => {
    const address = ipaddr.isValid(target.address) ? ipaddr.process(target.address) : null;
    const disabled = address?.range() === 'loopback' || (address?.kind() === 'ipv6' && address.range() !== 'unspecified');
    const processes = [...new Set(target.processes.map(process => process.name))].join(', ') || '未知进程';
    return { value: target.protocol + '|' + target.address + '|' + target.port, label: String(target.port), target, disabled,
      description: target.protocol.toUpperCase() + ' · ' + target.address + ' · ' + processes + (disabled ? ' · 无法通过容器 IPv4 转发' : '') };
  }), manual], [ports.data?.data]);
  const choice = options.find(option => option.value === selected);
  const custom = admin || selected === 'manual';
  return <Panel title="公网端口转发" detail="将容器中的服务映射到公网端口" action={resource && <Button type="button" disabled={resource.state !== 'ready'} onClick={() => { setSelected(''); setProtocol('tcp'); setTargetPort(''); setOpen(true); }}><Plus/>添加转发</Button>}>
    {!open && <Feedback error={command.error}/>}
    {rules.length ? <Table><TableHeader><TableRow><TableHead>公网入口</TableHead><TableHead>容器端口</TableHead><TableHead>状态</TableHead><TableHead>备注</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
      {rules.map(rule => <TableRow key={rule.id}><TableCell><div className="mono">{publicHost || '未设置公网地址'}:{rule.publicPort}</div><small>{rule.protocol.toUpperCase()}</small></TableCell>
        <TableCell className="mono">{rule.targetPort}</TableCell><TableCell><Status state={rule.state}/>{rule.error && <div className="text-xs text-destructive-foreground">{rule.error}</div>}</TableCell><TableCell>{rule.note || '—'}</TableCell><TableCell><div className="flex gap-1">
          <Button type="button" size="xs" variant="ghost" loading={command.pending} onClick={() => command.run(prefix + '/forwards/' + rule.id + '/' + (rule.enabled ? 'disable' : 'enable'))}>{rule.enabled ? '暂停' : '启用'}</Button>
          <Button type="button" size="xs" variant="ghost" loading={command.pending} onClick={() => command.run(prefix + '/forwards/' + rule.id + '/delete')}>删除</Button>
        </div></TableCell></TableRow>)}
    </TableBody></Table> : <Empty title="还没有公网转发">添加一个转发，让外网访问你的服务。</Empty>}
    <Modal open={open} onClose={() => setOpen(false)} title="添加端口转发" description="目标地址固定为你的 LXC，公网端口可自动分配。"
      footer={<Button form="forward-form" type="submit" loading={command.pending} disabled={!admin && (!choice || choice.disabled)}>创建转发</Button>}>
      <Form id="forward-form" className="form-grid" onSubmit={async event => {
        event.preventDefault();
        if (!admin && (!choice || choice.disabled)) return;
        const form = new FormData(event.currentTarget), publicPort = String(form.get('publicPort'));
        const input = { protocol: custom ? protocol : choice?.target?.protocol, targetPort: custom ? Number(targetPort) : choice?.target?.port,
          publicPort: publicPort ? Number(publicPort) : undefined, note: form.get('note'), ...(admin ? { resourceId: resource?.id } : {}) };
        if (await command.run(prefix + '/forwards', input)) setOpen(false);
      }}>
        {!admin && <div className="col-span-full flex flex-col gap-3">
          <div className="inline-field-action"><Field name="listener"><FieldLabel>容器端口</FieldLabel><Select name="listener" required items={options} value={choice || null} itemToStringValue={option => option.value} onValueChange={option => {
            setSelected(option?.value || '');
            if (option?.target) { setProtocol(option.target.protocol); setTargetPort(String(option.target.port)); }
          }}>
            <SelectTrigger className="h-auto min-h-10 py-2"><SelectValue>{(option: PortChoice | null) => option ? <span className="flex flex-col text-left"><span>{option.label}</span><span className="text-xs text-muted-foreground">{option.description}</span></span> : '选择监听服务或手动指定'}</SelectValue></SelectTrigger>
            <SelectPopup>{options.map(option => <SelectItem key={option.value} value={option} disabled={option.disabled}><span className="flex flex-col"><span>{option.label}</span><span className="text-xs text-muted-foreground">{option.description}</span></span></SelectItem>)}</SelectPopup>
          </Select></Field><Button type="button" size="icon-sm" variant="outline" aria-label="刷新监听服务" title="刷新监听服务" loading={ports.isFetching} onClick={() => void ports.refetch()}><RefreshCw/></Button></div>
          <Feedback error={ports.error?.message || ports.data?.error || undefined}/>
        </div>}
        {custom && <><Choice label="协议" value={protocol} onChange={setProtocol} items={[{ value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }]}/><TextField label={admin ? '容器端口' : '自定义容器端口'} type="number" min={1} max={65535} required value={targetPort} onChange={event => setTargetPort(event.target.value)}/></>}
        <TextField label="公网端口" name="publicPort" type="number" min={1} max={65535} placeholder="留空自动分配"/>
        <TextField label="备注" name="note" placeholder="例如：毕业设计 Web 服务"/>
        <Feedback error={command.error}/>
      </Form>
    </Modal>
  </Panel>;
}
