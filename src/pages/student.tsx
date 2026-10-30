import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Forward, ProfileSummary, Resource, Student } from '../../shared/schema';
import { request, useCommand } from '@/lib/api';
import { Feedback, Loading } from '@/components/common/feedback';
import { PageTitle } from '@/components/common/panel';
import { ProfileChoice } from '@/components/catalog/profile-choice';
import { TextField } from '@/components/common/form-fields';
import { ForwardPanel } from '@/components/forward/forward-panel';
import { MachineDetail } from '@/components/resource/machine-detail';
import { TaskList } from '@/components/activity/task-list';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { StudentGuides } from '@/components/guides/student-guides';

export function StudentPage({ studentId }: { studentId: string }) {
  const command = useCommand(),
    [profile, setProfile] = useState('');
  const query = useQuery({
    queryKey: ['student-overview', studentId],
    queryFn: () =>
      request<{
        student: Student;
        resource?: Resource;
        forwards: Forward[];
        publicHost: string;
        profiles: ProfileSummary[];
        selfSelection: boolean;
      }>('me/overview'),
    refetchInterval: 5000,
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <Feedback error={query.error.message} />;
  const d = query.data;
  return (
    <>
      <StudentGuides />
      {d.resource ? (
        <>
          <MachineDetail resource={d.resource} forwards={d.forwards} publicHost={d.publicHost} />
          <ForwardPanel resource={d.resource} rules={d.forwards} publicHost={d.publicHost} />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle render={<h2 />}>创建你的计算环境</CardTitle>
            <CardDescription>输入平台密码开始分配，系统会同步设置 root 密码。</CardDescription>
          </CardHeader>
          <CardPanel>
            <Form
              className="flex max-w-lg flex-col gap-4"
              onSubmit={async event => {
                event.preventDefault();
                await command.run('me/create', {
                  password: new FormData(event.currentTarget).get('password'),
                  profileId: profile || undefined,
                });
              }}
            >
              <Feedback {...command} />
              {d.selfSelection && !d.student.profileId && (
                <ProfileChoice value={profile} onChange={setProfile} items={d.profiles} />
              )}
              <TextField label="平台密码" name="password" type="password" required minLength={10} />
              <Button type="submit" className="self-start" loading={command.pending}>
                创建资源
              </Button>
            </Form>
          </CardPanel>
        </Card>
      )}
    </>
  );
}

export function StudentTasksPage() {
  return (
    <>
      <PageTitle title="任务记录" />
      <TaskList />
    </>
  );
}
