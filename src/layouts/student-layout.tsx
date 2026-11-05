import { NavLink, Outlet } from 'react-router-dom';
import { ChevronsUpDown } from 'lucide-react';
import type { Actor } from '../../shared/schema';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MenuTrigger } from '@/components/ui/menu';
import { AccountMenu, Brand } from './shell-parts';

const navigation = [
  { route: 'workspace', label: '工作台' },
  { route: 'tasks', label: '任务记录' },
];

export function StudentLayout({ title, actor }: { title: string; actor: Actor }) {
  return (
    <div className="min-h-svh bg-sidebar">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Brand title={title} compact />
          <nav aria-label="学生导航" className="flex gap-1 whitespace-nowrap text-sm">
            {navigation.map(item => (
              <NavLink
                key={item.route}
                to={'/student/' + item.route}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 hover:bg-accent',
                    isActive ? 'bg-accent font-medium' : 'text-muted-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <AccountMenu
            side="bottom"
            trigger={
              <MenuTrigger render={<Button variant="ghost" className="ms-auto gap-1.5 px-2" />}>
                <span className="tabular-nums">{actor.sub}</span>
                <ChevronsUpDown className="size-3.5 opacity-60" />
              </MenuTrigger>
            }
          />
        </div>
      </header>
      <main className="mx-auto flex min-w-0 max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
