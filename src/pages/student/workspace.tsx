import { useQuery } from '@tanstack/react-query';
import type { Forward, ProfileSummary, Resource, Student } from '../../../shared/schema';
import { request } from '@/lib/api';
import { Feedback, Loading } from '@/components/common/feedback';
import { ForwardPanel } from '@/components/forward/forward-panel';
import { StudentGuides } from '@/components/guides/student-guides';
import { CreateResourceCard } from '@/components/resource/create-resource-card';
import { MachineDetail } from '@/components/resource/machine-detail';

export function WorkspacePage({ studentId }: { studentId: string }) {
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
  const { student, resource, forwards, publicHost, profiles, selfSelection } = query.data;
  return (
    <>
      <StudentGuides />
      {resource ? (
        <>
          <MachineDetail resource={resource} forwards={forwards} publicHost={publicHost} />
          <ForwardPanel resource={resource} rules={forwards} publicHost={publicHost} />
        </>
      ) : (
        <CreateResourceCard profiles={selfSelection && !student.profileId ? profiles : undefined} />
      )}
    </>
  );
}
