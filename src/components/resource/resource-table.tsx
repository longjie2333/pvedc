import { useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import type { AdminStudent, Resource } from '../../../shared/schema';
import { mebibytes } from '@/lib/format';
import { Empty } from '@/components/common/feedback';
import { Status } from '@/components/common/status';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Searchable list of allocated instances. */
export function ResourceTable({
  resources,
  students,
  onOpen,
}: {
  resources: Resource[];
  students: AdminStudent[];
  onOpen: (resource: Resource) => void;
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
  return (
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
                  {resource.spec.cores} 核 · {mebibytes(resource.spec.memory)} · {resource.spec.disk} GiB
                </TableCell>
                <TableCell className="font-mono text-xs">{resource.networks[0]?.ip ?? '—'}</TableCell>
                <TableCell>
                  <Status state={resource.state} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => onOpen(resource)}>
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
  );
}
