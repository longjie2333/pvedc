import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import type { Resource } from '../../../shared/schema';
import { useAdminOverview, useSettings } from '@/lib/queries';
import { Modal } from '@/components/common/modal';
import { AdminForwardDialog } from '@/components/forward/admin-forward-dialog';
import { ForwardPanel } from '@/components/forward/forward-panel';
import { Button } from '@/components/ui/button';
import { ListeningPorts } from './listening-ports';
import { MachineActions, type MachineOperations } from './machine-actions';
import { MachineDetail } from './machine-detail';
import { NetworkInterfaces } from './network-interfaces';
import { ResourceAdjust } from './resource-adjust';

// Administrators set a new password directly and may reclaim the machine.
const operations: MachineOperations = {
  password: ['newPassword'],
  rebuild: ['confirmation', 'newPassword'],
  reclaim: ['confirmation'],
};

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
              resource={resource}
              api={'admin/resources/' + resource.id}
              forwards={forwards}
              publicHost={publicHost}
              actions={status => (
                <MachineActions
                  resource={resource}
                  status={status}
                  endpoint={action => 'admin/resources/' + resource.id + '/' + action}
                  operations={operations}
                >
                  <Button
                    variant="outline"
                    disabled={!['ready', 'failed', 'reserved'].includes(resource.state)}
                    onClick={() => {
                      setAdjusting(resource);
                      onClose();
                    }}
                  >
                    <Settings2 />
                    调整配置
                  </Button>
                </MachineActions>
              )}
            >
              <NetworkInterfaces resource={resource} />
              <ListeningPorts resource={resource} />
            </MachineDetail>
            <ForwardPanel
              api="admin/forwards"
              rules={forwards}
              publicHost={publicHost}
              action={<AdminForwardDialog resource={resource} />}
            />
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
