import { Plus, Trash2 } from 'lucide-react';
import { Choice, FormSection } from '@/components/common/form-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type InitialForwardDraft = { protocol: 'tcp' | 'udp'; targetPort: string; publicPort: string; note: string };

/** Forwards requested automatically once a container of this profile is created. */
export function InitialForwardSection({
  value,
  onChange,
}: {
  value: InitialForwardDraft[];
  onChange: (forwards: InitialForwardDraft[]) => void;
}) {
  const update = (index: number, patch: Partial<InitialForwardDraft>) =>
    onChange(value.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  return (
    <FormSection
      legend="初始化转发"
      description="容器创建完成后自动申请公网端口并同步到 gost。"
      action={
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...value, { protocol: 'tcp', targetPort: '', publicPort: '', note: '' }])}
        >
          <Plus />
          添加转发
        </Button>
      }
    >
      {value.length > 0 && (
        <div className="flex flex-col gap-2">
          <div
            aria-hidden="true"
            className="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_2rem] gap-2 text-muted-foreground text-xs max-sm:hidden"
          >
            <span>协议</span>
            <span>容器端口</span>
            <span>公网端口</span>
            <span>备注</span>
          </div>
          {value.map((forward, index) => (
            <div
              className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-2 sm:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_2rem]"
              key={index}
            >
              <Choice
                hideLabel
                label={'第 ' + (index + 1) + ' 条转发协议'}
                value={forward.protocol}
                onChange={protocol => update(index, { protocol: protocol as 'tcp' | 'udp' })}
                items={[
                  { value: 'tcp', label: 'TCP' },
                  { value: 'udp', label: 'UDP' },
                ]}
              />
              <Input
                aria-label={'第 ' + (index + 1) + ' 条转发容器端口'}
                type="number"
                min={1}
                max={65535}
                placeholder="容器端口"
                value={forward.targetPort}
                onChange={event => update(index, { targetPort: event.target.value })}
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={'删除第 ' + (index + 1) + ' 条转发'}
                className="sm:order-last"
                onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
              >
                <Trash2 />
              </Button>
              <Input
                aria-label={'第 ' + (index + 1) + ' 条转发公网端口'}
                type="number"
                min={1}
                max={65535}
                placeholder="自动分配"
                className="max-sm:col-span-2"
                value={forward.publicPort}
                onChange={event => update(index, { publicPort: event.target.value })}
              />
              <Input
                aria-label={'第 ' + (index + 1) + ' 条转发备注'}
                placeholder="备注"
                className="max-sm:col-span-2"
                value={forward.note}
                onChange={event => update(index, { note: event.target.value })}
              />
            </div>
          ))}
        </div>
      )}
    </FormSection>
  );
}
