import type { ReactNode } from 'react';
import { Copy } from 'lucide-react';
import type { Forward } from '../../../shared/schema';
import { useCommand } from '@/lib/api';
import { copyText } from '@/lib/feedback';
import { Empty, Feedback } from '@/components/common/feedback';
import { Status } from '@/components/common/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/**
 * Forward rules with pause/resume and delete against `api` (e.g. `me/forwards`).
 * `action` is the caller's add-forward control; omit it where rules are only managed.
 */
export function ForwardPanel({
  api,
  rules,
  publicHost,
  action,
}: {
  api: string;
  rules: Forward[];
  publicHost: string;
  action?: ReactNode;
}) {
  const command = useCommand();
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <CardTitle render={<h2 />}>公网转发</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      {command.error && (
        <div className="px-6">
          <Feedback error={command.error} />
        </div>
      )}
      {rules.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>公网入口</TableHead>
              <TableHead>容器端口</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>状态</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map(rule => (
              <TableRow key={rule.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <Badge variant="outline" size="sm">
                      {rule.protocol.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-xs">
                      {publicHost || '未设置公网地址'}:{rule.publicPort}
                    </span>
                    {publicHost && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="复制公网入口"
                        onClick={() => copyText(publicHost + ':' + rule.publicPort)}
                      >
                        <Copy />
                      </Button>
                    )}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">{rule.targetPort}</TableCell>
                <TableCell>{rule.note || '—'}</TableCell>
                <TableCell>
                  <Status state={rule.state} />
                  {rule.error && <div className="text-xs text-destructive-foreground">{rule.error}</div>}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      loading={command.pending}
                      onClick={() => command.run(api + '/' + rule.id + '/' + (rule.enabled ? 'disable' : 'enable'))}
                    >
                      {rule.enabled ? '暂停' : '启用'}
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      loading={command.pending}
                      onClick={() => command.run(api + '/' + rule.id + '/delete')}
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <CardPanel>
          <Empty title="还没有公网转发" />
        </CardPanel>
      )}
    </Card>
  );
}
