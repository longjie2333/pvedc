import { useQuery } from '@tanstack/react-query';
import type { Forward, ProfileSummary, Resource, Student } from '../../../shared/schema';
import { request } from '@/lib/api';
import { Feedback, Loading } from '@/components/common/feedback';
import { ForwardPanel } from '@/components/forward/forward-panel';
import { StudentForwardDialog } from '@/components/forward/student-forward-dialog';
import { StudentGuides } from '@/components/guides/student-guides';
import { CreateResourceCard } from '@/components/resource/create-resource-card';
import { MachineActions, type MachineOperations } from '@/components/resource/machine-actions';
import { MachineDetail } from '@/components/resource/machine-detail';
import { NetworkInterfaces } from '@/components/resource/network-interfaces';

// Students confirm sensitive operations with their current platform password.
const operations: MachineOperations = {
  password: ['password', 'newPassword'],
  rebuild: ['confirmation', 'password'],
};

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
          <MachineDetail
            resource={resource}
            api="me"
            forwards={forwards}
            publicHost={publicHost}
            actions={status => (
              <MachineActions
                resource={resource}
                status={status}
                endpoint={action => 'me/resource/' + action}
                operations={operations}
              />
            )}
          >
            {resource.networks.length > 1 && <NetworkInterfaces resource={resource} />}
          </MachineDetail>
          <ForwardPanel
            api="me/forwards"
            rules={forwards}
            publicHost={publicHost}
            action={<StudentForwardDialog resource={resource} />}
          />
        </>
      ) : (
        <CreateResourceCard profiles={selfSelection && !student.profileId ? profiles : undefined} />
      )}
    </>
  );
}
