import { Link } from 'react-router-dom';
import type { BatchResult } from '../../../shared/batch';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const statusNames = { queued: '已提交', skipped: '已跳过', failed: '未受理' };

export function BatchResultCard({ result }: { result: BatchResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />}>批量操作受理结果</CardTitle>
        <CardDescription>已提交的任务在后台继续执行</CardDescription>
        <CardAction>
          <Button type="button" variant="outline" size="sm" render={<Link to="/admin/tasks" />}>
            查看任务记录
          </Button>
        </CardAction>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>学号</TableHead>
            <TableHead>结果</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.items.map(item => (
            <TableRow key={item.studentId}>
              <TableCell className="font-mono text-xs">{item.studentId}</TableCell>
              <TableCell>
                {statusNames[item.status]}
                {item.message && <div className="text-muted-foreground text-xs">{item.message}</div>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
