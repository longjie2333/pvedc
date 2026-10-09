import { useQuery } from '@tanstack/react-query';
import { Cpu, HardDrive, MemoryStick } from 'lucide-react';
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HostMetrics, Sample } from '../../shared/metrics';
import { request } from '@/lib/api';
import { Empty, Feedback, Loading, Panel, Stat, Status, bytes, date } from './common';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const charts = [
  { title: '宿主 CPU · %', series: [{ key: 'cpuPercent', label: 'CPU', color: '#347659' }] },
  { title: '宿主内存 · GiB', series: [{ key: 'memoryGiB', label: '已用内存', color: '#4677a6' }] },
  { title: '宿主网络 · KiB/s', series: [{ key: 'netInKiB', label: '接收', color: '#347659' }, { key: 'netOutKiB', label: '发送', color: '#b08740' }] },
];

export function HostOverview() {
  const status = useQuery({ queryKey: ['host-status'], queryFn: () => request<Sample<HostMetrics>>('admin/host/status'), refetchInterval: 5000 });
  const history = useQuery({ queryKey: ['host-history'], queryFn: () => request<Sample<Record<string, number>[]>>('admin/host/history'), refetchInterval: 60000 });
  const host = status.data?.data;
  const points = history.data?.data?.map(point => ({ time: point.time,
    cpuPercent: typeof point.cpu === 'number' ? point.cpu * 100 : null,
    memoryGiB: typeof point.memused === 'number' ? point.memused / 1073741824 : null,
    netInKiB: typeof point.netin === 'number' ? point.netin / 1024 : null,
    netOutKiB: typeof point.netout === 'number' ? point.netout / 1024 : null,
  })) || [];
  return <>
    <Panel title="宿主机总体状况" detail={host ? host.node + ' · ' + host.cpuModel + ' · ' + host.version : 'PVE 节点状态与存储用量'}>
      <div className="flex flex-col gap-4 p-5">
        <Feedback error={status.error?.message || status.data?.error || undefined}/>
        {status.isPending ? <Loading/> : host ? <>
          <div className="stat-grid">
            <Stat label="宿主 CPU 使用率" value={(host.cpu * 100).toFixed(1) + '%'} detail={host.cpus + ' 逻辑核心'} icon={<Cpu/>}/>
            <Stat label="宿主内存使用" value={bytes(host.memory.used)} detail={'总计 ' + bytes(host.memory.total)} icon={<MemoryStick/>}/>
            <Stat label="宿主系统盘" value={bytes(host.rootfs.used)} detail={'总计 ' + bytes(host.rootfs.total)} icon={<HardDrive/>}/>
            <Stat label="交换空间使用" value={bytes(host.swap.used)} detail={'总计 ' + bytes(host.swap.total)} icon={<MemoryStick/>}/>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>负载（1 / 5 / 15 分钟）：{host.load.join(' / ')}</span>
            <span>运行时间：{Math.floor(host.uptime / 86400)} 天 {Math.floor(host.uptime / 3600) % 24} 小时 {Math.floor(host.uptime / 60) % 60} 分钟</span>
            <span>更新：{status.data?.updatedAt ? new Date(status.data.updatedAt).toLocaleTimeString('zh-CN') : '—'}</span>
          </div>
          <Table><TableHeader><TableRow><TableHead>存储</TableHead><TableHead>类型</TableHead><TableHead>状态</TableHead><TableHead>已用 / 总量</TableHead><TableHead>可用</TableHead></TableRow></TableHeader><TableBody>
            {host.storages.map(storage => <TableRow key={storage.name}><TableCell>{storage.name}</TableCell><TableCell>{storage.type}</TableCell><TableCell><Status state={storage.active ? 'ready' : 'unknown'}/></TableCell><TableCell>{storage.used === null ? '—' : bytes(storage.used)} / {storage.total === null ? '—' : bytes(storage.total)}</TableCell><TableCell>{storage.available === null ? '—' : bytes(storage.available)}</TableCell></TableRow>)}
          </TableBody></Table>
        </> : <Empty title="宿主机指标暂时不可用"/>}
      </div>
    </Panel>
    <Feedback error={history.error?.message || history.data?.error || undefined}/>
    <div className="grid gap-5 xl:grid-cols-3">{charts.map(chart => <Panel key={chart.title} title={chart.title} detail="最近一小时 · PVE 历史采样">
      {points.length ? <div className="h-56 p-3"><ResponsiveContainer width="100%" height="100%"><LineChart data={points}>
        <XAxis dataKey="time" tickFormatter={value => new Date(Number(value) * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} minTickGap={60} axisLine={false} tickLine={false}/>
        <YAxis width={45} axisLine={false} tickLine={false}/><Tooltip labelFormatter={value => date(Number(value))} formatter={value => typeof value === 'number' ? value.toFixed(2) : String(value ?? '—')}/><Legend/>
        {chart.series.map(series => <Line key={series.key} dataKey={series.key} name={series.label} stroke={series.color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false}/>)}
      </LineChart></ResponsiveContainer></div> : <Empty title="暂无宿主机历史采样"/>}
    </Panel>)}</div>
  </>;
}
