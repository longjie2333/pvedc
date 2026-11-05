import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HostMetrics as Host, Sample } from '../../../shared/metrics';
import { request } from '@/lib/api';
import { bytes } from '@/lib/format';
import { ChartTooltip } from '@/components/common/chart-tooltip';
import { Empty, Feedback, Loading } from '@/components/common/feedback';
import { Card, CardAction, CardFooter, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Meter, MeterIndicator, MeterLabel, MeterTrack } from '@/components/ui/meter';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';

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

/** PVE host trend chart and capacity meters. */
export function HostMetrics() {
  const status = useQuery({
    queryKey: ['host-status'],
    queryFn: () => request<Sample<Host>>('admin/host/status'),
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
