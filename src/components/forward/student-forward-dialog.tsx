import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ipaddr from 'ipaddr.js';
import { RefreshCw } from 'lucide-react';
import type { ListeningPort, Resource } from '../../../shared/schema';
import type { Sample } from '../../../shared/metrics';
import { request } from '@/lib/api';
import { Feedback } from '@/components/common/feedback';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ForwardDialog, ManualTargetFields } from './forward-dialog';

interface PortChoice {
  value: string;
  label: string;
  description: string;
  target?: ListeningPort;
  disabled?: boolean;
}
const manual: PortChoice = { value: 'manual', label: '手动指定端口', description: '也可为尚未启动的服务提前配置转发' };

function choices(ports: ListeningPort[]): PortChoice[] {
  return [
    ...ports.map(target => {
      const displayAddress = target.address.replace(/%[^\s]+$/, '');
      const address = ipaddr.isValid(displayAddress) ? ipaddr.process(displayAddress) : null;
      const disabled =
        address?.range() === 'loopback' || (address?.kind() === 'ipv6' && address.range() !== 'unspecified');
      const processes = [...new Set(target.processes.map(process => process.name))].join(', ') || '未知进程';
      return {
        value: target.protocol + '|' + target.address + '|' + target.port,
        label: String(target.port),
        target,
        disabled,
        description:
          target.protocol.toUpperCase() +
          ' · ' +
          displayAddress +
          ' · ' +
          processes +
          (disabled ? ' · 无法通过容器 IPv4 转发' : ''),
      };
    }),
    manual,
  ];
}

/** Student forward: pick a service listening in the container, or enter the port by hand. */
export function StudentForwardDialog({ resource }: { resource: Resource }) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState('');
  const [protocol, setProtocol] = useState('tcp'),
    [port, setPort] = useState('');
  // Listening ports are read only while the dialog is open.
  const ports = useQuery({
    queryKey: ['forward-ports', resource.id],
    queryFn: () => request<Sample<ListeningPort[]>>('me/ports'),
    enabled: open && resource.state === 'ready',
    refetchInterval: open ? 15000 : false,
  });
  const options = useMemo(() => choices(ports.data?.data || []), [ports.data?.data]);
  const choice = options.find(option => option.value === selected);
  const target =
    !choice || choice.disabled
      ? undefined
      : choice === manual
        ? { protocol, targetPort: Number(port) }
        : { protocol: choice.target!.protocol, targetPort: choice.target!.port };
  return (
    <ForwardDialog
      resource={resource}
      api="me/forwards"
      target={target}
      open={open}
      onOpenChange={next => {
        if (next) {
          setSelected('');
          setProtocol('tcp');
          setPort('');
        }
        setOpen(next);
      }}
    >
      <div className="col-span-full flex flex-col gap-3">
        <div className="inline-field-action">
          <Field name="listener">
            <FieldLabel>容器端口</FieldLabel>
            <Select
              name="listener"
              required
              items={options}
              value={choice || null}
              itemToStringValue={option => option.value}
              onValueChange={option => {
                setSelected(option?.value || '');
                // Switching to manual afterwards starts from the last picked service.
                if (option?.target) {
                  setProtocol(option.target.protocol);
                  setPort(String(option.target.port));
                }
              }}
            >
              <SelectTrigger className="h-auto min-h-10 py-2">
                <SelectValue>
                  {(option: PortChoice | null) =>
                    option ? (
                      <span className="flex flex-col text-left">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </span>
                    ) : (
                      '选择监听服务或手动指定'
                    )
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {options.map(option => (
                  <SelectItem key={option.value} value={option} disabled={option.disabled}>
                    <span className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="刷新监听服务"
            title="刷新监听服务"
            loading={ports.isFetching}
            onClick={() => void ports.refetch()}
          >
            <RefreshCw />
          </Button>
        </div>
        <Feedback error={ports.error?.message || ports.data?.error || undefined} />
      </div>
      {choice === manual && (
        <ManualTargetFields
          protocol={protocol}
          port={port}
          onProtocol={setProtocol}
          onPort={setPort}
          portLabel="自定义容器端口"
        />
      )}
    </ForwardDialog>
  );
}
