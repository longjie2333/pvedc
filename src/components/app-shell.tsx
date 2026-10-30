import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { NavLink, useLocation } from 'react-router-dom';
import { Activity, ArrowUpRight, BookOpen, ChevronsUpDown, HardDrive, LayoutDashboard, ListChecks, LogOut, Network, Server, Settings2, Users } from 'lucide-react';
import type { Actor } from '../../shared/schema';
import { request, useCommand } from '@/lib/api';
import { Button } from './ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from './ui/breadcrumb';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from './ui/menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from './ui/sidebar';
import { cn } from '@/lib/utils';

export const adminNavigation = [
  [{ id: 'overview', label: '总览', icon: LayoutDashboard }, { id: 'students', label: '学生名单', icon: Users }, { id: 'guides', label: '指导书', icon: BookOpen }],
  [{ id: 'profiles', label: '资源配置', icon: HardDrive }, { id: 'networks', label: '网络与地址池', icon: Network }, { id: 'templates', label: '系统模板', icon: ListChecks }, { id: 'forwarding', label: '公网转发', icon: ArrowUpRight }],
  [{ id: 'tasks', label: '任务与审计', icon: Activity }, { id: 'settings', label: '平台设置', icon: Settings2 }],
];
const studentNavigation = [{ id: 'workspace', label: '工作台' }, { id: 'tasks', label: '任务记录' }];

const HeaderSlot = createContext<HTMLElement | null>(null);
/** Page-level actions rendered at the right of the admin header; labels collapse to icons on small screens. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlot);
  return slot ? createPortal(children, slot) : null;
}

export function HeaderButton({ icon, label, ...props }: ComponentProps<typeof Button> & { icon: ReactNode; label: string }) {
  return <Button {...props} className="max-sm:size-9 max-sm:px-0">{icon}<span className="max-sm:sr-only">{label}</span></Button>;
}

function Brand({ title, compact }: { title: string; compact?: boolean }) {
  return <NavLink to="/" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap font-semibold text-sm">
    <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground"><Server className="size-4"/></span>
    <span className={compact ? 'max-sm:sr-only' : undefined}>{title}</span>
  </NavLink>;
}

function AccountMenu({ trigger, side }: { trigger: ReactNode; side: 'top' | 'bottom' }) {
  const command = useCommand({ toastErrors: true });
  return <Menu>
    {trigger}
    <MenuPopup align={side === 'top' ? 'start' : 'end'} side={side}>
      <MenuItem variant="destructive" disabled={command.pending} onClick={() => command.run('auth/logout')}><LogOut/>退出登录</MenuItem>
    </MenuPopup>
  </Menu>;
}

function AdminNavigation({ page }: { page: string }) {
  const { setOpenMobile } = useSidebar();
  const overview = useQuery({ queryKey: ['admin-overview'], queryFn: () => request<{ taskCounts: { attention: number } }>('admin/overview'), refetchInterval: 5000 });
  const attention = overview.data?.taskCounts.attention ?? 0;
  return <>{adminNavigation.map((items, index) => <SidebarGroup key={index}><SidebarGroupContent><SidebarMenu>
    {items.map(item => <SidebarMenuItem key={item.id}>
      <SidebarMenuButton isActive={item.id === page} render={<NavLink to={'/admin/' + item.id} onClick={() => setOpenMobile(false)}/>}><item.icon/><span>{item.label}</span></SidebarMenuButton>
      {item.id === 'tasks' && attention > 0 ? <SidebarMenuBadge className="text-warning-foreground">{attention}</SidebarMenuBadge> : null}
    </SidebarMenuItem>)}
  </SidebarMenu></SidebarGroupContent></SidebarGroup>)}</>;
}

export function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  const page = useLocation().pathname.split('/')[2] || 'overview';
  const current = adminNavigation.flat().find(item => item.id === page);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return <SidebarProvider>
    <Sidebar variant="inset">
      <SidebarHeader className="px-4 pt-4 pb-2"><Brand title={title}/></SidebarHeader>
      <SidebarContent><AdminNavigation page={page}/></SidebarContent>
      <SidebarFooter>
        <AccountMenu side="top" trigger={<MenuTrigger render={<SidebarMenuButton/>}>
          <span className="flex-1 truncate text-left font-medium">管理员</span><ChevronsUpDown className="ms-auto size-4 opacity-60"/>
        </MenuTrigger>}/>
      </SidebarFooter>
    </Sidebar>
    <SidebarInset>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ms-1" aria-label="切换导航"/>
        <Breadcrumb className="ms-1 min-w-0"><BreadcrumbList>
          <BreadcrumbItem className="max-sm:hidden"><BreadcrumbLink render={<NavLink to="/admin/overview"/>}>管理控制台</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator className="max-sm:hidden"/>
          <BreadcrumbItem><h1><BreadcrumbPage className="font-medium">{current?.label ?? '总览'}</BreadcrumbPage></h1></BreadcrumbItem>
        </BreadcrumbList></Breadcrumb>
        <div ref={setSlot} className="ms-auto flex shrink-0 items-center gap-2"/>
      </header>
      <HeaderSlot.Provider value={slot}><main className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 p-4 sm:p-6">{children}</main></HeaderSlot.Provider>
    </SidebarInset>
  </SidebarProvider>;
}

export function StudentShell({ title, actor, children }: { title: string; actor: Actor; children: ReactNode }) {
  return <div className="min-h-svh bg-sidebar">
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Brand title={title} compact/>
        <nav aria-label="学生导航" className="flex gap-1 whitespace-nowrap text-sm">
          {studentNavigation.map(item => <NavLink key={item.id} to={'/student/' + item.id} className={({ isActive }) => cn('rounded-md px-3 py-1.5 hover:bg-accent', isActive ? 'bg-accent font-medium' : 'text-muted-foreground')}>{item.label}</NavLink>)}
        </nav>
        <AccountMenu side="bottom" trigger={<MenuTrigger render={<Button variant="ghost" className="ms-auto gap-1.5 px-2"/>}>
          <span className="tabular-nums">{actor.sub}</span><ChevronsUpDown className="size-3.5 opacity-60"/>
        </MenuTrigger>}/>
      </div>
    </header>
    <main className="mx-auto flex min-w-0 max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">{children}</main>
  </div>;
}
