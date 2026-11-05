import { useCommand } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Feedback } from './feedback';
import { Modal } from './modal';

export interface PendingAction {
  title: string;
  description: string;
  path: string;
  method?: string;
}

/** Destructive confirmation that runs one API command and closes on success. */
export function ConfirmAction({
  action,
  onClose,
  confirmLabel = '确认',
}: {
  action?: PendingAction;
  onClose: () => void;
  confirmLabel?: string;
}) {
  const command = useCommand();
  return (
    <Modal
      destructive
      open={!!action}
      onClose={onClose}
      title={action?.title || '确认操作'}
      description={action?.description || ''}
      footer={
        <Button
          variant="destructive"
          loading={command.pending}
          onClick={async () => {
            if (action && (await command.run(action.path, {}, action.method || 'POST'))) onClose();
          }}
        >
          {confirmLabel}
        </Button>
      }
    >
      <Feedback error={command.error} />
    </Modal>
  );
}
