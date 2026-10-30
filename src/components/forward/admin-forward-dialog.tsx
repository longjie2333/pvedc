import { useState } from 'react';
import type { Resource } from '../../../shared/schema';
import { ForwardDialog, ManualTargetFields } from './forward-dialog';

/** Administrator forward for a given machine: protocol and port are always entered by hand. */
export function AdminForwardDialog({ resource }: { resource: Resource }) {
  const [open, setOpen] = useState(false);
  const [protocol, setProtocol] = useState('tcp'),
    [port, setPort] = useState('');
  return (
    <ForwardDialog
      resource={resource}
      api="admin/forwards"
      extra={{ resourceId: resource.id }}
      target={{ protocol, targetPort: Number(port) }}
      open={open}
      onOpenChange={next => {
        if (next) {
          setProtocol('tcp');
          setPort('');
        }
        setOpen(next);
      }}
    >
      <ManualTargetFields
        protocol={protocol}
        port={port}
        onProtocol={setProtocol}
        onPort={setPort}
        portLabel="容器端口"
      />
    </ForwardDialog>
  );
}
