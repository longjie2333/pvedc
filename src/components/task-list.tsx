import type { Task } from '../../shared/schema';
import { taskNames, taskStates } from '../../shared/activity';
import { useCommand } from '@/lib/api';
import { useActivityRecords } from '@/lib/activity';
import { Choice, Empty, Feedback, Loading, Panel, Status, TextField, date, stateNames } from './common';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { ActivityFilters } from './activity-filters';
import { RecordPagination } from './record-pagination';

export function TaskList({ admin = false, active = true }: { admin?: boolean; active?: boolean }) {
  const command = useCommand(), prefix = admin ? 'admin' : 'me';
  const records = useActivityRecords<Task>(prefix + '/tasks', active), { query, draft, setFilter } = records;
  return <Panel>
    <ActivityFilters {...records} loading={query.isFetching} refresh={() => void query.refetch()}>
      <Choice label="任务类型" value={draft.type || ''} onChange={value => setFilter('type', value)} items={[{ value: '', label: '全部类型' }, ...Object.entries(taskNames).map(([value, label]) => ({ value, label }))]}/>
      <Choice label="任务状态" value={draft.state || ''} onChange={value => setFilter('state', value)} items={[{ value: '', label: '全部状态' }, ...taskStates.map(value => ({ value, label: stateNames[value] }))]}/>
      {admin && <TextField label="学号" value={draft.studentId || ''} onChange={event => setFilter('studentId', event.target.value)}/>}
    </ActivityFilters>
    <Feedback error={query.error?.message || command.error}/>
    {query.isPending ? <Loading/> : query.data?.items.length ? <Table><TableHeader><TableRow><TableHead>任务</TableHead><TableHead>状态</TableHead><TableHead>执行阶段</TableHead><TableHead>时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
      {query.data.items.map(task => <TableRow key={task.id}>
        <TableCell><div>{taskNames[task.type] || task.type}</div><div className="font-mono text-muted-foreground text-xs">{task.studentId || '平台任务'}</div></TableCell>
        <TableCell><Status state={task.state}/></TableCell><TableCell className={task.error ? 'whitespace-normal text-destructive-foreground' : 'text-muted-foreground'}>{task.error || task.step}</TableCell><TableCell className="text-muted-foreground text-xs tabular-nums">{date(task.createdAt)}</TableCell>
        <TableCell>{!Object.hasOwn(taskNames, task.type) ? <span className="text-xs text-muted-foreground">历史记录</span> : <div className="flex gap-1">
          {['attention', 'failed'].includes(task.state) && <Button type="button" size="xs" variant="outline" loading={command.pending} onClick={() => command.run(prefix + '/tasks/' + task.id + '/retry')}>重试</Button>}
          {admin && task.type.startsWith('network-') && ['queued', 'attention'].includes(task.state) && <Button type="button" size="xs" variant="ghost" loading={command.pending} onClick={() => command.run('admin/tasks/' + task.id + '/cancel')}>取消</Button>}
        </div>}</TableCell>
      </TableRow>)}
    </TableBody></Table> : <Empty title="没有匹配的任务"/>}
    <RecordPagination {...records} total={query.data?.total || 0} loading={query.isFetching}/>
  </Panel>;
}
