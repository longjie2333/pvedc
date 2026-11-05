import { ChevronDown, X } from 'lucide-react';
import type { Profile } from '../../../shared/schema';
import { batchNames, type BatchAction } from '../../../shared/batch';
import { useCommand } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu';

const powerActions: BatchAction[] = ['start', 'shutdown', 'reboot'];

/**
 * Sticky bar for the selected students. Profile assignment runs here; machine and delete actions
 * go through `onBatch` so the caller can confirm them first.
 */
export function BatchToolbar({
  selected,
  visible,
  profiles,
  onSelectedChange,
  onBatch,
}: {
  selected: string[];
  visible: string[];
  profiles: Profile[];
  onSelectedChange: (ids: string[]) => void;
  onBatch: (action: BatchAction) => void;
}) {
  const assign = useCommand({ toastErrors: true });
  const assignTo = (profileId: string | null) => assign.run('admin/students/assign', { ids: selected, profileId });
  return (
    <div
      role="toolbar"
      aria-label="批量操作"
      className="sticky bottom-4 z-20 mx-auto flex max-w-full flex-wrap items-center gap-1 rounded-xl border bg-popover p-1.5 ps-4 shadow-lg/5"
    >
      <span className="me-2 text-sm">
        已选择 <span className="font-medium tabular-nums">{selected.length}</span> 人
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onSelectedChange(visible.filter(id => !selected.includes(id)))}
      >
        反选
      </Button>
      <Menu>
        <MenuTrigger render={<Button type="button" variant="ghost" size="sm" loading={assign.pending} />}>
          指定配置
          <ChevronDown />
        </MenuTrigger>
        <MenuPopup align="center" side="top">
          {profiles.map(profile => (
            <MenuItem key={profile.id} onClick={() => assignTo(profile.id)}>
              {profile.name}
            </MenuItem>
          ))}
          {profiles.length > 0 && <MenuSeparator />}
          <MenuItem onClick={() => assignTo(null)}>取消指定</MenuItem>
        </MenuPopup>
      </Menu>
      <Menu>
        <MenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
          电源
          <ChevronDown />
        </MenuTrigger>
        <MenuPopup align="center" side="top">
          {powerActions.map(action => (
            <MenuItem key={action} onClick={() => onBatch(action)}>
              {batchNames[action]}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
      {(['reclaim', 'delete'] as const).map(action => (
        <Button
          key={action}
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive-foreground"
          onClick={() => onBatch(action)}
        >
          {batchNames[action]}
        </Button>
      ))}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="清空选择" onClick={() => onSelectedChange([])}>
        <X />
      </Button>
    </div>
  );
}
