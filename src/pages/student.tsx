import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Forward, ProfileSummary, Resource, Student } from '../../shared/schema';
import { request, useCommand } from '@/lib/api';
import { Feedback, Loading, PageTitle, Panel, ProfileChoice, TextField } from '@/components/common';
import { ForwardPanel } from '@/components/forward-panel';
import { MachineDetail } from '@/components/resource';
import { TaskList } from '@/components/task-list';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { StudentGuides } from '@/components/student-guides';

export function StudentPage({ studentId }: { studentId: string }) {
  const command = useCommand(), [profile, setProfile] = useState('');
  const query = useQuery({ queryKey: ['student-overview', studentId], queryFn: () => request<{ student: Student; resource?: Resource; forwards: Forward[]; publicHost: string; profiles: ProfileSummary[]; selfSelection: boolean }>('me/overview'), refetchInterval: 5000 });
  if (query.isPending) return <Loading/>;
  if (query.error) return <Feedback error={query.error.message}/>;
  const d = query.data;
  return <>{d.resource ? <MachineDetail resource={d.resource}><StudentGuides/></MachineDetail> : <Panel title="创建你的计算环境" detail="输入平台密码开始分配，系统会同步设置 root 密码。"><Form className="p-6 flex max-w-lg flex-col gap-4" onSubmit={async event => { event.preventDefault(); await command.run('me/create', { password: new FormData(event.currentTarget).get('password'), profileId: profile || undefined }); }}><Feedback {...command}/>{d.selfSelection && !d.student.profileId && <ProfileChoice value={profile} onChange={setProfile} items={d.profiles}/>}<TextField label="平台密码" name="password" type="password" required minLength={10}/><Button type="submit" loading={command.pending}>创建资源</Button></Form></Panel>}<ForwardPanel resource={d.resource} rules={d.forwards} publicHost={d.publicHost}/></>;
}

export function StudentTasksPage() {
  return <><PageTitle eyebrow="TASKS" title="任务记录" description="查看资源创建、操作和转发任务的执行状态。"/><TaskList/></>;
}
