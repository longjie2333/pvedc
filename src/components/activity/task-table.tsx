import type { ReactNode } from 'react';
import type { Task } from '../../../shared/schema';
import { taskNames, taskStates } from '../../../shared/activity';
import { date } from '@/lib/format';
import { Choice } from '@/components/common/form-fields';
import { Status, stateNames } from '@/components/common/status';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Type and state filters for task records; `children` appends caller-specific filters. */
export function TaskFilters({
  draft,
  setFilter,
  children,
}: {
  draft: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  children?: ReactNode;
}) {
  return (
    <>
      <Choice
        label="任务类型"
        value={draft.type || ''}
        onChange={value => setFilter('type', value)}
        items={[
          { value: '', label: '全部类型' },
          ...Object.entries(taskNames).map(([value, label]) => ({ value, label })),
        ]}
      />
      <Choice
        label="任务状态"
        value={draft.state || ''}
        onChange={value => setFilter('state', value)}
        items={[{ value: '', label: '全部状态' }, ...taskStates.map(value => ({ value, label: stateNames[value] }))]}
      />
      {children}
    </>
  );
}

export const retryable = (task: Task) => ['attention', 'failed'].includes(task.state);

/** Task rows; `actions` renders the operation buttons a caller allows for a current task type. */
export function TaskTable({ tasks, actions }: { tasks: Task[]; actions: (task: Task) => ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>任务</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>执行阶段</TableHead>
          <TableHead>时间</TableHead>
          <TableHead>操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map(task => (
          <TableRow key={task.id}>
            <TableCell>
              <div>{taskNames[task.type] || task.type}</div>
              <div className="font-mono text-muted-foreground text-xs">{task.studentId || '平台任务'}</div>
            </TableCell>
            <TableCell>
              <Status state={task.state} />
            </TableCell>
            <TableCell
              className={task.error ? 'whitespace-normal text-destructive-foreground' : 'text-muted-foreground'}
            >
              {task.error || task.step}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs tabular-nums">{date(task.createdAt)}</TableCell>
            <TableCell>
              {Object.hasOwn(taskNames, task.type) ? (
                <div className="flex gap-1">{actions(task)}</div>
              ) : (
                <span className="text-xs text-muted-foreground">历史记录</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
