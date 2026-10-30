import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { Network } from '../../../shared/schema';
import { Choice, FormSection } from '@/components/common/form-fields';
import { Button } from '@/components/ui/button';

/** Ordered network list of a profile; index n becomes eth n. */
export function ProfileNicSection({
  value,
  onChange,
  networks,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  networks: Network[];
}) {
  const move = (index: number, offset: number) => {
    const list = [...value],
      target = index + offset;
    [list[index], list[target]] = [list[target], list[index]];
    onChange(list);
  };
  return (
    <FormSection
      legend="网卡"
      description="按顺序对应 eth0、eth1……；eth0 承担默认网关、DNS 与公网转发。"
      action={
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={value.length >= Math.min(8, networks.length)}
          onClick={() => onChange([...value, networks.find(n => !value.includes(n.id))?.id || ''])}
        >
          <Plus />
          添加网卡
        </Button>
      }
    >
      {value.length ? (
        <div className="flex flex-col gap-2">
          {value.map((networkId, index) => (
            <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2" key={index}>
              <span aria-hidden="true" className="font-mono text-muted-foreground text-sm">
                eth{index}
              </span>
              <Choice
                hideLabel
                label={'网卡 eth' + index}
                value={networkId}
                onChange={id => onChange(value.map((item, itemIndex) => (itemIndex === index ? id : item)))}
                items={networks
                  .filter(n => n.id === networkId || !value.includes(n.id))
                  .map(n => ({ value: n.id, label: n.name + (n.ready ? '' : '（待应用）') }))}
              />
              <div className="flex">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={'上移 eth' + index}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={'下移 eth' + index}
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={'删除 eth' + index}
                  disabled={value.length <= 1}
                  onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">请先创建网络配置。</p>
      )}
    </FormSection>
  );
}
