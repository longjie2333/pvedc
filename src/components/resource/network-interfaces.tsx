import type { Resource } from '../../../shared/schema';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function NetworkInterfaces({ resource }: { resource: Resource }) {
  return (
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
  );
}
