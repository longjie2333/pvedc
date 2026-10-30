import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { Resource } from '../../../shared/schema';
import { useCommand } from '@/lib/api';
import { Feedback } from '@/components/common/feedback';
import { Choice, TextField } from '@/components/common/form-fields';
import { Modal } from '@/components/common/modal';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';

export interface ForwardTarget {
  protocol: string;
  targetPort: number;
}

/**
 * "添加转发" button and dialog. The caller owns the target fields (`children`) and their state, and
 * passes the resulting `target`, or undefined while nothing valid is chosen.
 */
export function ForwardDialog({
  resource,
  api,
  extra,
  target,
  open,
  onOpenChange,
  children,
}: {
  resource: Resource;
  api: string;
  extra?: Record<string, unknown>;
  target?: ForwardTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const command = useCommand();
  return (
    <>
      <Button type="button" size="sm" disabled={resource.state !== 'ready'} onClick={() => onOpenChange(true)}>
        <Plus />
        添加转发
      </Button>
      <Modal
        open={open}
        onClose={() => onOpenChange(false)}
        title="添加端口转发"
        description="目标地址固定为你的 LXC，公网端口可自动分配。"
        footer={
          <Button form="forward-form" type="submit" loading={command.pending} disabled={!target}>
            创建转发
          </Button>
        }
      >
        <Form
          id="forward-form"
          className="form-grid"
          onSubmit={async event => {
            event.preventDefault();
            if (!target) return;
            const form = new FormData(event.currentTarget),
              publicPort = String(form.get('publicPort'));
            const input = {
              ...target,
              publicPort: publicPort ? Number(publicPort) : undefined,
              note: form.get('note'),
              ...extra,
            };
            if (await command.run(api, input)) onOpenChange(false);
          }}
        >
          {children}
          <TextField label="公网端口" name="publicPort" type="number" min={1} max={65535} placeholder="留空自动分配" />
          <TextField label="备注" name="note" placeholder="例如：毕业设计 Web 服务" />
          <Feedback error={command.error} />
        </Form>
      </Modal>
    </>
  );
}

/** Protocol and container port entered by hand. */
export function ManualTargetFields({
  protocol,
  port,
  onProtocol,
  onPort,
  portLabel,
}: {
  protocol: string;
  port: string;
  onProtocol: (protocol: string) => void;
  onPort: (port: string) => void;
  portLabel: string;
}) {
  return (
    <>
      <Choice
        label="协议"
        value={protocol}
        onChange={onProtocol}
        items={[
          { value: 'tcp', label: 'TCP' },
          { value: 'udp', label: 'UDP' },
        ]}
      />
      <TextField
        label={portLabel}
        type="number"
        min={1}
        max={65535}
        required
        value={port}
        onChange={event => onPort(event.target.value)}
      />
    </>
  );
}
