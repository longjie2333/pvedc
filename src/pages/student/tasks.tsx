import { PageTitle } from '@/components/common/panel';
import { TaskList } from '@/components/activity/task-list';

export function StudentTasksPage() {
  return (
    <>
      <PageTitle title="任务记录" />
      <TaskList />
    </>
  );
}
