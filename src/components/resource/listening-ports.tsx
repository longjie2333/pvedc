import { useQuery } from '@tanstack/react-query';
import type { ListeningPort, Resource } from '../../../shared/schema';
import type { Sample } from '../../../shared/metrics';
import { request } from '@/lib/api';
import { Empty, Feedback } from '@/components/common/feedback';
import { Card, CardAction, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Administrator view of the services listening inside a machine, with process names and PIDs. */
export function ListeningPorts({ resource }: { resource: Resource }) {
  const ports = useQuery({
    queryKey: ['machine-ports', resource.id],
    queryFn: () => request<Sample<ListeningPort[]>>('admin/resources/' + resource.id + '/ports'),
    enabled: resource.state === 'ready',
    refetchInterval: 15000,
  });
  return (
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
  );
}
