import { useState } from 'react';
import type { Resource } from '../../../shared/schema';
import { useAdminOverview, useSettings } from '@/lib/queries';
import { Modal } from '@/components/common/modal';
import { ForwardPanel } from '@/components/forward/forward-panel';
import { MachineDetail } from './machine-detail';
import { ResourceAdjust } from './resource-adjust';

/** Administrator view of one student's machine, including the adjust flow it opens. */
export function MachineDialog({ resource, onClose }: { resource?: Resource; onClose: () => void }) {
  const overview = useAdminOverview(),
    settings = useSettings();
  const [adjusting, setAdjusting] = useState<Resource>();
  const forwards = (overview.data?.forwards || []).filter(forward => forward.resourceId === resource?.id);
  const publicHost = settings.data?.publicHost || '';
  return (
    <>
      <Modal open={!!resource} onClose={onClose} title="学生计算资源" description={resource?.studentId || ''}>
        {resource && (
          <div className="grid gap-6">
            <MachineDetail
              admin
              resource={resource}
              forwards={forwards}
              publicHost={publicHost}
              onAdjust={() => {
                setAdjusting(resource);
                onClose();
              }}
            />
            <ForwardPanel admin resource={resource} rules={forwards} publicHost={publicHost} />
          </div>
        )}
      </Modal>
      {adjusting && (
        <ResourceAdjust
          key={adjusting.id + adjusting.state}
          resource={adjusting}
          networks={overview.data?.networks || []}
          onClose={() => setAdjusting(undefined)}
        />
      )}
    </>
  );
}
