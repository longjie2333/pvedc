import { copyText } from '@/lib/feedback';
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, Copy, Cpu, HardDrive, MemoryStick, Power, RotateCw } from 'lucide-react';
import type { ListeningPort, Resource } from '../../shared/schema';
import { Button } from './ui/button';
import { Form } from './ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Empty, Feedback, Modal, Panel, Stat, Status, TextField, bytes, date } from './common';
import { request, useCommand } from '@/lib/api';

interface Sample<T> { data: T | null; error: string | null; updatedAt: number | null }
interface Metrics { status: string; cpu: number; cpus: number; mem: number; maxmem: number; disk: number; maxdisk: number; netin: number; netout: number; uptime: number }
export function MachineDetail({ resource, admin = false }: { resource: Resource; admin?: boolean }) {
  const prefix = admin ? 'admin/resources/' + resource.id : 'me';
  const status = useQuery({ queryKey: ['machine-status', resource.id], queryFn: () => request<Sample<Metrics>>(prefix + '/status'), enabled: resource.state === 'ready', refetchInterval: 5000 });
  const ports = useQuery({ queryKey: ['machine-ports', resource.id], queryFn: () => request<Sample<ListeningPort[]>>(prefix + '/ports'), enabled: admin && resource.state === 'ready', refetchInterval: admin ? 15000 : false });
  const history = useQuery({ queryKey: ['machine-history', resource.id], queryFn: () => request<Sample<Record<string, number>[]>>(prefix + '/history'), enabled: resource.state === 'ready', refetchInterval: 60000 });
  const command = useCommand(), [action, setAction] = useState('');
  const m = resource.state === 'ready' ? status.data?.data : undefined;
  const names: Record<string, string> = { start: '启动', shutdown: '关机', reboot: '重启', password: '修改密码', rebuild: '重建', reclaim: '回收' };
  async function perform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await command.run(admin ? 'admin/resources/' + resource.id + '/' + action : 'me/resource/' + action, Object.fromEntries(new FormData(event.currentTarget)));
    if (result) setAction('');
  }
  return <div className="flex flex-col gap-5"><div className="machine-banner"><div><span className="eyebrow">LXC / {resource.spec.distro.toUpperCase()}</span><h2>{resource.studentId} <Status state={m?.status || resource.state}/></h2><p>VMID {resource.vmid} · {resource.spec.name}</p></div><div className="machine-ip"><span>内网 IP 地址</span><strong>{resource.ip}</strong><Button variant="ghost" size="icon" aria-label="复制 IP 地址" onClick={() => copyText(resource.ip)}><Copy/></Button></div></div>
    <div className="flex flex-wrap gap-2">{Object.entries(names).filter(([key]) => key !== 'reclaim' || admin).map(([key, name]) => <Button key={key} variant={['rebuild', 'reclaim'].includes(key) ? 'destructive-outline' : 'outline'} onClick={() => setAction(key)}>{key === 'start' ? <Power/> : key === 'reboot' ? <RotateCw/> : null}{name}</Button>)}</div><Feedback {...command}/><Feedback error={status.error?.message || status.data?.error || undefined}/>
    <small>上次状态更新：{status.data?.updatedAt ? new Date(status.data.updatedAt).toLocaleString("zh-CN") : "尚未采集"}</small><div className="stat-grid"><Stat label="CPU 使用率" value={m ? (m.cpu * 100).toFixed(1) + '%' : '—'} detail={resource.spec.cores + ' vCPU'} icon={<Cpu/>}/><Stat label="内存使用" value={m ? bytes(m.mem) : '—'} detail={resource.spec.memory + ' MiB 总内存'} icon={<MemoryStick/>}/><Stat label="磁盘使用" value={m ? bytes(m.disk) : '—'} detail={resource.spec.disk + ' GiB 系统盘'} icon={<HardDrive/>}/><Stat label="累计网络接收" value={m ? bytes(m.netin) : '—'} detail={m ? '发送 ' + bytes(m.netout) : '等待采集'} icon={<ArrowUpRight/>}/></div>
    <Panel title="最近一小时" detail="CPU 使用率 · 来自 PVE 的历史采样"><Feedback error={history.data?.error || history.error?.message}/>{resource.state === "ready" && history.data?.data?.length ? <div className="chart"><ResponsiveContainer width="100%" height={200}><AreaChart data={history.data.data.map(d => ({ ...d, cpuPercent: typeof d.cpu === 'number' ? d.cpu * 100 : null }))}><defs><linearGradient id={'cpu-' + resource.id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#347659" stopOpacity={0.3}/><stop offset="100%" stopColor="#347659" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="time" tickFormatter={v => new Date(Number(v) * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} minTickGap={60} axisLine={false} tickLine={false}/><YAxis width={35} unit="%" axisLine={false} tickLine={false}/><Tooltip labelFormatter={v => date(Number(v))}/><Area dataKey="cpuPercent" name="CPU %" type="monotone" stroke="#347659" fill={'url(#cpu-' + resource.id + ')'} strokeWidth={2}/></AreaChart></ResponsiveContainer></div> : <Empty title="暂时没有历史采样"/>}</Panel>
    {admin && <Panel title="系统监听端口" detail={ports.data?.updatedAt ? '上次采集：' + new Date(ports.data.updatedAt).toLocaleTimeString('zh-CN') : '每十五秒刷新'}><Feedback error={ports.data?.error || ports.error?.message}/>{resource.state === "ready" && ports.data?.data?.length ? <Table><TableHeader><TableRow><TableHead>协议</TableHead><TableHead>监听地址</TableHead><TableHead>端口</TableHead><TableHead>进程</TableHead></TableRow></TableHeader><TableBody>{ports.data.data.map((p, i) => <TableRow key={i}><TableCell>{p.protocol.toUpperCase()}</TableCell><TableCell className="mono">{p.address}</TableCell><TableCell className="mono">{p.port}</TableCell><TableCell>{p.processes.map(process => process.name + ' · ' + process.pid).join(', ') || '—'}</TableCell></TableRow>)}</TableBody></Table> : <Empty title="暂无监听端口"/>}</Panel>}
    <Modal destructive={["rebuild", "reclaim"].includes(action)} open={!!action} onClose={() => setAction('')} title={(names[action] || '') + '容器'} description={['rebuild', 'reclaim'].includes(action) ? '此操作将永久清空系统盘数据。重建保留规格、IP 和转发规则；回收则释放资源。' : '操作将以后台任务执行，可在任务列表查看结果。'} footer={<Button type="submit" form="resource-action" loading={command.pending} variant={['rebuild', 'reclaim'].includes(action) ? 'destructive' : 'default'}>确认{names[action]}</Button>}><Form id="resource-action" className="flex flex-col gap-4" onSubmit={perform}><Feedback error={command.error}/>{['rebuild', 'reclaim'].includes(action) && <TextField label={'输入学号 ' + resource.studentId + ' 以确认'} name="confirmation" required/>}{['password', 'rebuild'].includes(action) && !admin && <TextField label="当前平台密码" name="password" type="password" required minLength={10}/ >}{(action === 'password' || (action === 'rebuild' && admin)) && <TextField label="新的平台和 root 密码" name="newPassword" type="password" required minLength={10}/>}</Form></Modal>
  </div>;
}
