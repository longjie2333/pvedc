import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut, Server } from 'lucide-react';
import { useCommand } from '@/lib/api';
import { Menu, MenuItem, MenuPopup } from '@/components/ui/menu';

export function Brand({ title, compact }: { title: string; compact?: boolean }) {
  return (
    <NavLink to="/" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap font-semibold text-sm">
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Server className="size-4" />
      </span>
      <span className={compact ? 'max-sm:sr-only' : undefined}>{title}</span>
    </NavLink>
  );
}

export function AccountMenu({ trigger, side }: { trigger: ReactNode; side: 'top' | 'bottom' }) {
  const command = useCommand({ toastErrors: true });
  return (
    <Menu>
      {trigger}
      <MenuPopup align={side === 'top' ? 'start' : 'end'} side={side}>
        <MenuItem variant="destructive" disabled={command.pending} onClick={() => command.run('auth/logout')}>
          <LogOut />
          退出登录
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
