import { copyText } from '@/lib/feedback';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  Copy,
  Ellipsis,
  KeyRound,
  Power,
  PowerOff,
  RotateCw,
  Settings2,
  Trash2,
} from 'lucide-react';
import type { Forward, ListeningPort, Resource } from '../../../shared/schema';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Group, GroupSeparator } from '@/components/ui/group';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, Feedback } from '@/components/common/feedback';
import { Modal } from '@/components/common/modal';
import { Status } from '@/components/common/status';
import { TextField } from '@/components/common/form-fields';
import { bytes, mebibytes } from '@/lib/format';
import { ChartTooltip } from '@/components/common/chart-tooltip';
import { request, useCommand } from '@/lib/api';

interface Sample<T> {
  data: T | null;
  error: string | null;
  updatedAt: number | null;
}
interface Metrics {
  status: string;
  cpu: number;
  cpus: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  netin: number;
  netout: number;
  uptime: number;
}
const names: Record<string, string> = {
  start: '启动',
  shutdown: '关机',
  reboot: '重启',
  password: '修改密码',
  rebuild: '重建',
  reclaim: '回收',
};
const destructive = ['rebuild', 'reclaim'];
const uptime = (seconds: number) => Math.floor(seconds / 86400) + ' 天 ' + (Math.floor(seconds / 3600) % 24) + ' 小时';

type Point = Record<string, number | null>;
const rate = (n: number) =>
  n >= 1048576
    ? (n / 1048576).toFixed(1) + ' MiB/s'
    : n >= 1024
      ? (n / 1024).toFixed(1) + ' KiB/s'
      : n.toFixed(0) + ' B/s';
const numeric = (value: unknown, scale = 1) => (typeof value === 'number' ? value * scale : null);

const Total = ({ value }: { value: number }) => (
  <span className="font-normal text-muted-foreground text-sm">/ {bytes(value)}</span>
);
/** Headline value with an edge-to-edge sparkline of the last hour; hovering shows the sampled value. */
function MetricCard({
  label,
  value,
  points,
  series,
  format,
  max,
}: {
  label: string;
  value: ReactNode;
  points: Point[];
  series: { key: string; name: string; color: string }[];
  format: (value: number) => string;
  max?: number;
}) {
  return (
    <Card className="gap-0">
      <div className="flex min-w-0 flex-col px-4 pt-4 @lg:px-5 @lg:pt-5">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-semibold text-lg tabular-nums *:whitespace-nowrap">
          {value}
        </span>
      </div>
      <div className="mt-auto h-16 pt-2 [&_.recharts-surface]:[clip-path:inset(0_round_0_0_15px_15px)]">
        {points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                {series.map(s => (
                  <linearGradient key={s.key} id={'fill-' + s.key} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <YAxis hide domain={[0, max || 'auto']} />
              <Tooltip
                cursor={{ stroke: 'var(--border)' }}
                allowEscapeViewBox={{ y: true }}
                wrapperStyle={{ zIndex: 10 }}
                content={<ChartTooltip format={format} />}
              />
              {series.map(item => (
                <Area
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.name}
                  stroke={item.color}
                  strokeWidth={1.5}
                  fill={`url(#fill-${item.key})`}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
function Fact({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={'flex min-w-0 items-center gap-1 text-sm' + (mono ? ' font-mono' : '')}>
        <span className="truncate">{value}</span>
        {copy && (
          <Button variant="ghost" size="icon-xs" aria-label={'复制' + label} onClick={() => copyText(value)}>
            <Copy />
          </Button>
        )}
      </dd>
    </div>
  );
}

export function MachineDetail({
  resource,
  admin = false,
  forwards = [],
  publicHost = '',
  onAdjust,
}: {
  resource: Resource;
  admin?: boolean;
  forwards?: Forward[];
  publicHost?: string;
  onAdjust?: () => void;
}) {
  const prefix = admin ? 'admin/resources/' + resource.id : 'me';
  const status = useQuery({
    queryKey: ['machine-status', resource.id],
    queryFn: () => request<Sample<Metrics>>(prefix + '/status'),
    enabled: resource.state === 'ready',
    refetchInterval: 5000,
  });
  const ports = useQuery({
    queryKey: ['machine-ports', resource.id],
    queryFn: () => request<Sample<ListeningPort[]>>(prefix + '/ports'),
    enabled: admin && resource.state === 'ready',
    refetchInterval: admin ? 15000 : false,
  });
  const history = useQuery({
    queryKey: ['machine-history', resource.id],
    queryFn: () => request<Sample<Record<string, number>[]>>(prefix + '/history'),
    enabled: resource.state === 'ready',
    refetchInterval: 60000,
  });
  const command = useCommand(),
    [action, setAction] = useState('');
  const m = resource.state === 'ready' ? status.data?.data : undefined;
  const ssh = forwards.find(rule => rule.protocol === 'tcp' && rule.targetPort === 22 && rule.enabled);
  const points: Point[] =
    resource.state === 'ready'
      ? (history.data?.data?.map(point => ({
          time: point.time,
          cpu: numeric(point.cpu, 100),
          mem: numeric(point.mem),
          disk: numeric(point.disk),
          netin: numeric(point.netin),
          netout: numeric(point.netout),
        })) ?? [])
      : [];
  const power =
    m?.status === 'running'
      ? ['shutdown', 'reboot']
      : m?.status === 'stopped'
        ? ['start']
        : ['start', 'shutdown', 'reboot'];
  async function perform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await command.run(
      admin ? 'admin/resources/' + resource.id + '/' + action : 'me/resource/' + action,
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (result) setAction('');
  }
  return (
    <div className="@container flex flex-col gap-6">
      <Card>
        <CardHeader className="@max-md:grid-cols-1!">
          <CardTitle render={<h2 />} className="flex items-center gap-2.5 text-2xl">
            {resource.studentId}
            <Status state={m?.status || resource.state} />
          </CardTitle>
          <CardDescription className="tabular-nums">
            VMID {resource.vmid} · {resource.spec.name}
            {m?.status === 'running' ? ' · 已运行 ' + uptime(m.uptime) : ''}
          </CardDescription>
          <CardAction className="flex gap-2 @max-md:col-start-1 @max-md:row-span-1 @max-md:row-start-auto @max-md:mt-3 @max-md:justify-self-start">
            <Group aria-label="电源">
              {power.map((key, index) => [
                index > 0 && <GroupSeparator key={key + '-separator'} />,
                <Button key={key} variant="outline" onClick={() => setAction(key)}>
                  {key === 'start' ? <Power /> : key === 'shutdown' ? <PowerOff /> : <RotateCw />}
                  {names[key]}
                </Button>,
              ])}
            </Group>
            {admin && (
              <Button
                variant="outline"
                disabled={!['ready', 'failed', 'reserved'].includes(resource.state)}
                onClick={onAdjust}
              >
                <Settings2 />
                调整配置
              </Button>
            )}
            <Menu>
              <MenuTrigger render={<Button variant="outline" size="icon" aria-label="更多操作" />}>
                <Ellipsis />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem onClick={() => setAction('password')}>
                  <KeyRound />
                  {names.password}
                </MenuItem>
                <MenuSeparator />
                <MenuItem variant="destructive" onClick={() => setAction('rebuild')}>
                  <Trash2 />
                  {names.rebuild}
                </MenuItem>
                {admin && (
                  <MenuItem variant="destructive" onClick={() => setAction('reclaim')}>
                    <ArrowDownToLine />
                    {names.reclaim}
                  </MenuItem>
                )}
              </MenuPopup>
            </Menu>
          </CardAction>
        </CardHeader>
        <CardPanel className="flex flex-col gap-4">
          <dl className="flex flex-col gap-x-8 gap-y-4 @md:flex-row @md:flex-wrap">
            <Fact label="系统" value={resource.spec.distro === 'ubuntu' ? 'Ubuntu' : 'Debian'} />
            <Fact
              label="规格"
              value={
                resource.spec.cores + ' 核 · ' + mebibytes(resource.spec.memory) + ' · ' + resource.spec.disk + ' GiB'
              }
            />
            <Fact label="内网 IP" value={resource.networks[0].ip} mono copy />
            {ssh && publicHost && (
              <Fact label="SSH" value={'ssh root@' + publicHost + ' -p ' + ssh.publicPort} mono copy />
            )}
          </dl>
          <Feedback
            error={
              status.error?.message || status.data?.error || history.error?.message || history.data?.error || undefined
            }
          />
        </CardPanel>
      </Card>
      <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
        <MetricCard
          label="CPU"
          value={m ? (m.cpu * 100).toFixed(1) + '%' : '—'}
          points={points}
          series={[{ key: 'cpu', name: 'CPU', color: 'var(--chart-1)' }]}
          format={value => value.toFixed(1) + '%'}
        />
        <MetricCard
          label="内存"
          value={
            m ? (
              <>
                <span>{bytes(m.mem)}</span>
                <Total value={m.maxmem} />
              </>
            ) : (
              '—'
            )
          }
          points={points}
          series={[{ key: 'mem', name: '内存', color: 'var(--chart-2)' }]}
          format={bytes}
          max={m?.maxmem}
        />
        <MetricCard
          label="磁盘"
          value={
            m ? (
              <>
                <span>{bytes(m.disk)}</span>
                <Total value={m.maxdisk} />
              </>
            ) : (
              '—'
            )
          }
          points={points}
          series={[{ key: 'disk', name: '磁盘', color: 'var(--chart-4)' }]}
          format={bytes}
          max={m?.maxdisk}
        />
        <MetricCard
          label="网络"
          value={
            m ? (
              <>
                <span className="inline-flex items-center">
                  <ArrowDown aria-label="接收" className="size-4 text-muted-foreground" />
                  {bytes(m.netin)}
                </span>
                <span className="inline-flex items-center">
                  <ArrowUp aria-label="发送" className="size-4 text-muted-foreground" />
                  {bytes(m.netout)}
                </span>
              </>
            ) : (
              '—'
            )
          }
          points={points}
          series={[
            { key: 'netin', name: '接收', color: 'var(--chart-1)' },
            { key: 'netout', name: '发送', color: 'var(--chart-3)' },
          ]}
          format={rate}
        />
      </div>
      {(admin || resource.networks.length > 1) && (
        <Card>
          <CardHeader>
            <CardTitle render={<h2 />}>网络接口</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>网卡</TableHead>
                <TableHead>网络</TableHead>
                <TableHead>地址</TableHead>
                <TableHead>MAC 地址</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resource.networks.map(entry => (
                <TableRow key={entry.iface}>
                  <TableCell className="font-mono text-xs">{entry.iface}</TableCell>
                  <TableCell>
                    <div>{entry.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {entry.bridge}
                      {entry.vlan ? ' · VLAN ' + entry.vlan : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{entry.ip}</div>
                    <div className="text-muted-foreground text-xs">
                      {entry.cidr}
                      {entry.gateway ? ' · 网关 ' + entry.gateway : ''}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.mac || '由 PVE 分配'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {admin && (
        <Card>
          <CardHeader>
            <CardTitle render={<h2 />}>系统监听端口</CardTitle>
            {ports.data?.updatedAt && (
              <CardAction className="text-muted-foreground text-xs tabular-nums">
                {new Date(ports.data.updatedAt).toLocaleTimeString('zh-CN')}
              </CardAction>
            )}
          </CardHeader>
          {(ports.data?.error || ports.error) && (
            <div className="px-6">
              <Feedback error={ports.data?.error || ports.error?.message} />
            </div>
          )}
          {resource.state === 'ready' && ports.data?.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>协议</TableHead>
                  <TableHead>监听地址</TableHead>
                  <TableHead>端口</TableHead>
                  <TableHead>进程</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ports.data.data.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{p.protocol.toUpperCase()}</TableCell>
                    <TableCell className="font-mono text-xs">{p.address}</TableCell>
                    <TableCell className="font-mono text-xs">{p.port}</TableCell>
                    <TableCell>
                      {p.processes.map(process => process.name + ' · ' + process.pid).join(', ') || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <CardPanel>
              <Empty title="暂无监听端口" />
            </CardPanel>
          )}
        </Card>
      )}
      <Modal
        destructive={destructive.includes(action)}
        open={!!action}
        onClose={() => setAction('')}
        title={(names[action] || '') + '容器'}
        description={
          destructive.includes(action)
            ? '此操作将永久清空系统盘数据。重建保留规格、IP 和转发规则；回收则释放资源。'
            : '操作将以后台任务执行，可在任务列表查看结果。'
        }
        footer={
          <Button
            type="submit"
            form="resource-action"
            loading={command.pending}
            variant={destructive.includes(action) ? 'destructive' : 'default'}
          >
            确认{names[action]}
          </Button>
        }
      >
        <Form id="resource-action" className="flex flex-col gap-4" onSubmit={perform}>
          <Feedback error={command.error} />
          {destructive.includes(action) && (
            <TextField label={'输入学号 ' + resource.studentId + ' 以确认'} name="confirmation" required />
          )}
          {['password', 'rebuild'].includes(action) && !admin && (
            <TextField label="当前平台密码" name="password" type="password" required minLength={10} />
          )}
          {(action === 'password' || (action === 'rebuild' && admin)) && (
            <TextField label="新的平台和 root 密码" name="newPassword" type="password" required minLength={10} />
          )}
        </Form>
      </Modal>
    </div>
  );
}
