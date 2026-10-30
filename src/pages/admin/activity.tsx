import { useMatch, useNavigate } from 'react-router-dom';
import { AuditList } from '@/components/activity/audit-list';
import { TaskList } from '@/components/activity/task-list';
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
        <TaskList admin active={tab === 'tasks'} />
      </TabsPanel>
      <TabsPanel value="audit" keepMounted>
        <AuditList active={tab === 'audit'} />
      </TabsPanel>
    </Tabs>
  );
}
