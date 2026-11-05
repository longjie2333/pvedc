import { useQuery } from '@tanstack/react-query';
import type { AuditRecord } from '../../../shared/activity';
import { request } from '@/lib/api';
import { useActivityRecords } from '@/lib/activity';
import { date } from '@/lib/format';
import { RecordPanel } from '@/components/activity/record-panel';
import { Choice, TextField } from '@/components/common/form-fields';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function AuditList({ active }: { active: boolean }) {
  const records = useActivityRecords<AuditRecord>('admin/audit', active),
    { query, draft, setFilter } = records;
  const actions = useQuery({
    queryKey: ['audit-actions'],
    queryFn: () => request<{ action: string }[]>('admin/audit/actions'),
    enabled: active,
  });
  return (
    <RecordPanel
      records={records}
      refresh={() => {
        void query.refetch();
        void actions.refetch();
      }}
      error={actions.error?.message}
      emptyTitle="没有匹配的审计记录"
      filters={
        <>
          <TextField
            label="操作者"
            value={draft.actor || ''}
            onChange={event => setFilter('actor', event.target.value)}
          />
          <Choice
            label="操作类型"
            value={draft.action || ''}
            onChange={value => setFilter('action', value)}
            items={[
              { value: '', label: '全部操作' },
              ...(actions.data || []).map(item => ({ value: item.action, label: item.action })),
            ]}
          />
        </>
      }
    >
      {items => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>操作者</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>目标 / 详情</TableHead>
              <TableHead>时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell>{item.actor}</TableCell>
                <TableCell>{item.action}</TableCell>
                <TableCell>
                  <div>{item.target || '—'}</div>
                  {item.detail && <div className="whitespace-normal text-muted-foreground text-xs">{item.detail}</div>}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs tabular-nums">{date(item.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </RecordPanel>
  );
}
