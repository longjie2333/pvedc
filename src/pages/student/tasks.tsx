import type { Task } from '../../../shared/schema';
import { useCommand } from '@/lib/api';
import { useActivityRecords } from '@/lib/activity';
import { RecordPanel } from '@/components/activity/record-panel';
import { TaskFilters, TaskTable, retryable } from '@/components/activity/task-table';
import { PageTitle } from '@/components/common/panel';
import { Button } from '@/components/ui/button';

export function StudentTasksPage() {
  const records = useActivityRecords<Task>('me/tasks', true),
    command = useCommand();
  return (
    <>
      <PageTitle title="任务记录" />
      <RecordPanel
        records={records}
        error={command.error}
        emptyTitle="没有匹配的任务"
        filters={<TaskFilters {...records} />}
      >
        {tasks => (
          <TaskTable
            tasks={tasks}
            actions={task =>
              retryable(task) && (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  loading={command.pending}
                  onClick={() => command.run('me/tasks/' + task.id + '/retry')}
                >
                  重试
                </Button>
              )
            }
          />
        )}
      </RecordPanel>
    </>
  );
}
