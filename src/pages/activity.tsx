import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuditRecord } from '../../shared/activity';
import { request } from '@/lib/api';
import { useActivityRecords } from '@/lib/activity';
import { ActivityFilters } from '@/components/activity-filters';
import { RecordPagination } from '@/components/record-pagination';
import { TaskList } from '@/components/task-list';
import { Choice, Empty, Feedback, Loading, Panel, TextField, date } from '@/components/common';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';

export function ActivityPage() {
  const [tab, setTab] = useState('tasks');
  return <Tabs value={tab} onValueChange={value => setTab(String(value))}>
    <TabsList aria-label="记录类别"><TabsTab value="tasks">任务记录</TabsTab><TabsTab value="audit">操作审计</TabsTab></TabsList>
    <TabsPanel value="tasks" keepMounted><TaskList admin active={tab === 'tasks'}/></TabsPanel>
    <TabsPanel value="audit" keepMounted><AuditList active={tab === 'audit'}/></TabsPanel>
  </Tabs>;
}

function AuditList({ active }: { active: boolean }) {
  const records = useActivityRecords<AuditRecord>('admin/audit', active), { query, draft, setFilter } = records;
  const actions = useQuery({ queryKey: ['audit-actions'], queryFn: () => request<{ action: string }[]>('admin/audit/actions'), enabled: active });
  return <Panel title="操作审计" detail="查询平台操作及目标对象">
    <ActivityFilters {...records} loading={query.isFetching} refresh={() => { void query.refetch(); void actions.refetch(); }}>
      <TextField label="操作者" value={draft.actor || ''} onChange={event => setFilter('actor', event.target.value)}/>
      <Choice label="操作类型" value={draft.action || ''} onChange={value => setFilter('action', value)} items={[{ value: '', label: '全部操作' }, ...(actions.data || []).map(item => ({ value: item.action, label: item.action }))]}/>
    </ActivityFilters>
    <Feedback error={query.error?.message || actions.error?.message}/>
    {query.isPending ? <Loading/> : query.data?.items.length ? <Table><TableHeader><TableRow><TableHead>操作者</TableHead><TableHead>操作</TableHead><TableHead>目标 / 详情</TableHead><TableHead>时间</TableHead></TableRow></TableHeader><TableBody>
      {query.data.items.map(item => <TableRow key={item.id}><TableCell>{item.actor}</TableCell><TableCell>{item.action}</TableCell><TableCell>{item.target || '—'}<small>{item.detail}</small></TableCell><TableCell>{date(item.created_at)}</TableCell></TableRow>)}
    </TableBody></Table> : <Empty title="没有匹配的审计记录"/>}
    <RecordPagination {...records} total={query.data?.total || 0} loading={query.isFetching}/>
  </Panel>;
}
