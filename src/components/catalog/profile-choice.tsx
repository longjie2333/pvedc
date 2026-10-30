import type { ProfileSummary } from '../../../shared/schema';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ProfileChoice({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: ProfileSummary[];
}) {
  const options = [
    {
      value: { id: '', name: '使用默认配置', cores: 0, memory: 0, disk: 0, distro: 'debian' as const },
      label: '使用默认配置',
    },
    ...items.map(item => ({ value: item, label: item.name })),
  ];
  const selected = options.find(item => item.value.id === value) || options[0];
  const detail = (item: ProfileSummary) =>
    item.id
      ? `${item.distro.toUpperCase()} · ${item.cores} CPU / ${item.memory} MiB / ${item.disk} GiB`
      : '由平台默认配置决定';
  return (
    <Field>
      <FieldLabel>资源配置</FieldLabel>
      <Select
        items={options}
        value={selected}
        itemToStringValue={item => item.value.id}
        onValueChange={item => onChange(item?.value.id || '')}
      >
        <SelectTrigger className="h-auto min-h-10 py-2">
          <SelectValue>
            {(item: typeof selected | null) =>
              item ? (
                <span className="flex flex-col text-left">
                  <span>{item.value.name}</span>
                  <span className="text-xs text-muted-foreground">{detail(item.value)}</span>
                </span>
              ) : (
                '选择资源配置'
              )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {options.map(item => (
            <SelectItem key={item.value.id || 'default'} value={item}>
              <span className="flex flex-col">
                <span>{item.value.name}</span>
                <span className="text-xs text-muted-foreground">{detail(item.value)}</span>
              </span>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </Field>
  );
}
