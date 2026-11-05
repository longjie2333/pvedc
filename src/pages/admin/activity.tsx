import { useMatch, useNavigate } from 'react-router-dom';
import type { Task } from '../../../shared/schema';
import { useCommand } from '@/lib/api';
import { useActivityRecords } from '@/lib/activity';
import { AuditList } from '@/components/activity/audit-list';
import { RecordPanel } from '@/components/activity/record-panel';
import { TaskFilters, TaskTable, retryable } from '@/components/activity/task-table';
import { TextField } from '@/components/common/form-fields';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';

/**
 * Layout route for /admin/tasks and /admin/audit: the URL selects the tab, and both lists stay
 * mounted so each keeps its own filters and page while only the visible one polls.
 */
export function ActivityPage() {
  const tab = useMatch('/admin/audit') ? 'audit' : 'tasks';
  const navigate = useNavigate();
  return (
    <Tabs value={tab} onValueChange={value => navigate('/admin/' + String(value))} className="gap-4">
      <TabsList aria-label="记录类别">
        <TabsTab value="tasks">任务记录</TabsTab>
        <TabsTab value="audit">操作审计</TabsTab>
      </TabsList>
      <TabsPanel value="tasks" keepMounted>
        <AdminTaskList active={tab === 'tasks'} />
      </TabsPanel>
      <TabsPanel value="audit" keepMounted>
        <AuditList active={tab === 'audit'} />
      </TabsPanel>
    </Tabs>
  );
}

const cancellable = (task: Task) => task.type.startsWith('network-') && ['queued', 'attention'].includes(task.state);

function AdminTaskList({ active }: { active: boolean }) {
  const records = useActivityRecords<Task>('admin/tasks', active),
    { draft, setFilter } = records;
  const command = useCommand();
  return (
    <RecordPanel
      records={records}
      error={command.error}
      emptyTitle="没有匹配的任务"
      filters={
        <TaskFilters {...records}>
          <TextField
            label="学号"
            value={draft.studentId || ''}
            onChange={event => setFilter('studentId', event.target.value)}
          />
        </TaskFilters>
      }
    >
      {tasks => (
        <TaskTable
          tasks={tasks}
          actions={task => (
            <>
              {retryable(task) && (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  loading={command.pending}
                  onClick={() => command.run('admin/tasks/' + task.id + '/retry')}
                >
                  重试
                </Button>
              )}
              {cancellable(task) && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  loading={command.pending}
                  onClick={() => command.run('admin/tasks/' + task.id + '/cancel')}
                >
                  取消
                </Button>
              )}
            </>
          )}
        />
      )}
    </RecordPanel>
  );
}
