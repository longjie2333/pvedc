import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Search, Settings2 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HostMetrics, Sample } from '../../shared/metrics';
import type { AdminStudent, Resource } from '../../shared/schema';
import { request } from '@/lib/api';
import { Empty, Feedback, Loading, Status, bytes } from './common';
import { ChartTooltip } from './chart-tooltip';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardAction, CardFooter, CardHeader, CardPanel, CardTitle } from './ui/card';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { Meter, MeterIndicator, MeterLabel, MeterTrack } from './ui/meter';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsList, TabsPanel, TabsTab } from './ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';

type Point = Record<string, number | null>;
const charts = [
  { id: 'cpu', label: 'CPU', unit: '%', series: [{ key: 'cpuPercent', label: 'CPU', color: 'var(--chart-1)' }] },
  {
    id: 'memory',
    label: '内存',
    unit: ' GiB',
    series: [{ key: 'memoryGiB', label: '已用内存', color: 'var(--chart-2)' }],
  },
  {
    id: 'network',
    label: '网络',
    unit: ' KiB/s',
    series: [
      { key: 'netInKiB', label: '接收', color: 'var(--chart-1)' },
      { key: 'netOutKiB', label: '发送', color: 'var(--chart-3)' },
    ],
  },
];
const clock = (value: unknown) =>
  new Date(Number(value) * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const memory = (mib: number) => (mib % 1024 ? mib + ' MiB' : mib / 1024 + ' GiB');

function Trend({ points, chart }: { points: Point[]; chart: (typeof charts)[number] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={points} margin={{ top: 0, right: 0, bottom: 0, left: -24 }}>
        <defs>
          {chart.series.map(series => (
            <linearGradient key={series.key} id={'fill-' + series.key} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={series.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="time"
          tickFormatter={clock}
          minTickGap={60}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
        />
        <YAxis width={44} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
        <Tooltip
          cursor={{ stroke: 'var(--border)' }}
          content={<ChartTooltip format={value => value.toFixed(2) + chart.unit} />}
        />
        {chart.series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
        {chart.series.map(series => (
          <Area
            key={series.key}
            type="monotone"
            dataKey={series.key}
            name={series.label}
            stroke={series.color}
            strokeWidth={1.75}
            fill={`url(#fill-${series.key})`}
            isAnimationActive={false}
            connectNulls={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Usage({
  label,
  used,
  total,
  detail,
}: {
  label: string;
  used: number | null;
  total: number | null;
  detail?: string;
}) {
  const percent = used !== null && total ? Math.min(100, (used / total) * 100) : 0;
  return (
    <Meter value={percent} className="gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <MeterLabel className="truncate font-normal text-muted-foreground">{label}</MeterLabel>
        <span className="whitespace-nowrap text-sm tabular-nums">
          {detail ?? (used === null || total === null ? '不可用' : bytes(used) + ' / ' + bytes(total))}
        </span>
      </div>
      <MeterTrack className="h-1.5 rounded-full">
        <MeterIndicator className={percent > 80 ? 'bg-warning' : undefined} />
      </MeterTrack>
    </Meter>
  );
}

function HostCards() {
  const status = useQuery({
    queryKey: ['host-status'],
    queryFn: () => request<Sample<HostMetrics>>('admin/host/status'),
    refetchInterval: 5000,
  });
  const history = useQuery({
    queryKey: ['host-history'],
    queryFn: () => request<Sample<Record<string, number>[]>>('admin/host/history'),
    refetchInterval: 60000,
  });
  const host = status.data?.data;
  const points: Point[] =
    history.data?.data?.map(point => ({
      time: point.time,
      cpuPercent: typeof point.cpu === 'number' ? point.cpu * 100 : null,
      memoryGiB: typeof point.memused === 'number' ? point.memused / 1073741824 : null,
      netInKiB: typeof point.netin === 'number' ? point.netin / 1024 : null,
      netOutKiB: typeof point.netout === 'number' ? point.netout / 1024 : null,
    })) || [];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <Tabs defaultValue="cpu">
          <CardHeader>
            <CardTitle render={<h2 />}>宿主机 {host?.node ?? ''}</CardTitle>
            <CardAction>
              <TabsList size="sm">
                {charts.map(chart => (
                  <TabsTab key={chart.id} value={chart.id}>
                    {chart.label}
                  </TabsTab>
                ))}
              </TabsList>
            </CardAction>
          </CardHeader>
          <CardPanel>
            <Feedback error={history.error?.message || history.data?.error || undefined} />
            {history.isPending ? (
              <Loading />
            ) : points.length ? (
              charts.map(chart => (
                <TabsPanel key={chart.id} value={chart.id}>
                  <Trend points={points} chart={chart} />
                </TabsPanel>
              ))
            ) : (
              <Empty title="暂无宿主机历史采样" />
            )}
          </CardPanel>
        </Tabs>
      </Card>
      <Card className="lg:[contain:size]">
        <CardHeader>
          <CardTitle render={<h2 />}>容量</CardTitle>
          {host && (
            <CardAction className="text-muted-foreground text-xs tabular-nums">负载 {host.load.join(' · ')}</CardAction>
          )}
        </CardHeader>
        <ScrollArea scrollFade>
          <CardPanel className="flex flex-col gap-4">
            <Feedback error={status.error?.message || status.data?.error || undefined} />
            {status.isPending ? (
              <Loading />
            ) : host ? (
              <>
                <Usage
                  label="CPU"
                  used={host.cpu}
                  total={1}
                  detail={(host.cpu * 100).toFixed(1) + '% · ' + host.cpus + ' 核'}
                />
                <Usage label="内存" used={host.memory.used} total={host.memory.total} />
                <Usage label="系统盘" used={host.rootfs.used} total={host.rootfs.total} />
                {host.storages.map(storage => (
                  <Usage
                    key={storage.name}
                    label={storage.name}
                    used={storage.active ? storage.used : null}
                    total={storage.active ? storage.total : null}
                  />
                ))}
                <Usage label="交换" used={host.swap.used} total={host.swap.total} />
              </>
            ) : (
              <Empty title="宿主机指标暂时不可用" />
            )}
          </CardPanel>
        </ScrollArea>
        {host && (
          <CardFooter className="text-muted-foreground text-xs tabular-nums flex justify-end">
            已运行 {Math.floor(host.uptime / 86400)} 天 {Math.floor(host.uptime / 3600) % 24} 小时 · 更新{' '}
            {status.data?.updatedAt ? new Date(status.data.updatedAt).toLocaleTimeString('zh-CN') : '—'}
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

export function AdminOverview({
  students,
  resources,
  attention,
  registrationOpen,
  onMachine,
}: {
  students: AdminStudent[];
  resources: Resource[];
  attention: number;
  registrationOpen: boolean;
  onMachine: (resource: Resource) => void;
}) {
  const [search, setSearch] = useState('');
  const names = new Map(students.map(student => [student.id, student.name]));
  const keyword = search.trim().toLowerCase();
  const visible = keyword
    ? resources.filter(resource =>
        [
          resource.studentId,
          names.get(resource.studentId) || '',
          String(resource.vmid),
          ...resource.networks.map(network => network.ip),
        ].some(value => value.toLowerCase().includes(keyword)),
      )
    : resources;
  const kpis = [
    { label: '名单学生', value: students.length },
    { label: '已认领', value: students.filter(student => student.claimed).length, of: students.length },
    { label: '已分配实例', value: resources.length },
    { label: '待处理任务', value: attention, warn: attention > 0 },
  ];
  return (
    <>
      {!registrationOpen && (
        <Alert variant="info">
          <Settings2 />
          <AlertTitle>准备好后，再开放学生申请</AlertTitle>
          <AlertDescription>依次完成 PVE 连接、系统模板、网络、默认资源配置。</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" render={<Link to="/admin/settings" />}>
              配置平台 <ArrowUpRight />
            </Button>
          </AlertAction>
        </Alert>
      )}
      <Card className="grid grid-cols-2 md:grid-cols-4 md:divide-x max-md:gap-y-4 max-md:py-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="px-6 md:py-5">
            <div className="text-muted-foreground text-sm">{kpi.label}</div>
            <div className={'mt-1 font-semibold text-2xl tabular-nums' + (kpi.warn ? ' text-warning-foreground' : '')}>
              {kpi.value}
              {kpi.of !== undefined && (
                <span className="ms-1 font-normal text-base text-muted-foreground">/ {kpi.of}</span>
              )}
            </div>
          </div>
        ))}
      </Card>
      <HostCards />
      <Card className="overflow-hidden">
        <CardHeader className="border-b py-4">
          <CardTitle render={<h2 />} className="row-span-2 h-full flex items-center">
            实例
          </CardTitle>
          {resources.length > 0 && (
            <CardAction>
              <InputGroup className="w-48 sm:w-60">
                <InputGroupInput
                  aria-label="搜索实例"
                  placeholder="学号、姓名、VMID 或 IP"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                />
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
              </InputGroup>
            </CardAction>
          )}
        </CardHeader>
        {visible.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>学生</TableHead>
                <TableHead>实例</TableHead>
                <TableHead>配置</TableHead>
                <TableHead>内网 IP</TableHead>
                <TableHead>状态</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(resource => (
                <TableRow key={resource.id}>
                  <TableCell>
                    <div className="font-medium">{names.get(resource.studentId) || resource.studentId}</div>
                    <div className="text-muted-foreground text-xs tabular-nums">{resource.studentId}</div>
                  </TableCell>
                  <TableCell>
                    <div className="tabular-nums">VMID {resource.vmid}</div>
                    <div className="text-muted-foreground text-xs">
                      {resource.spec.distro} · {resource.networks.length} 网卡
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {resource.spec.cores} 核 · {memory(resource.spec.memory)} · {resource.spec.disk} GiB
                  </TableCell>
                  <TableCell className="font-mono text-xs">{resource.networks[0]?.ip ?? '—'}</TableCell>
                  <TableCell>
                    <Status state={resource.state} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => onMachine(resource)}>
                      查看 <ArrowUpRight />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardPanel>
            {resources.length ? (
              <Empty title="没有匹配的实例" />
            ) : (
              <Empty title="第一台实例，将从这里开始">完成平台配置后，学生即可自行认领和创建。</Empty>
            )}
          </CardPanel>
        )}
      </Card>
    </>
  );
}
