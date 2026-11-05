import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  ChevronsUpDown,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  Network,
  Settings2,
  Users,
} from 'lucide-react';
import { useAdminOverview } from '@/lib/queries';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { MenuTrigger } from '@/components/ui/menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { HeaderSlot } from './header-actions';
import { AccountMenu, Brand } from './shell-parts';

/** `routes` lists every first-level admin route the entry stands for. */
const navigation = [
  [
    { routes: ['overview'], label: '总览', icon: LayoutDashboard },
    { routes: ['students'], label: '学生名单', icon: Users },
    { routes: ['guides'], label: '指导书', icon: BookOpen },
  ],
  [
    { routes: ['profiles'], label: '资源配置', icon: HardDrive },
    { routes: ['networks'], label: '网络与地址池', icon: Network },
    { routes: ['templates'], label: '系统模板', icon: ListChecks },
    { routes: ['forwarding'], label: '公网转发', icon: ArrowUpRight },
  ],
  [
    { routes: ['tasks', 'audit'], label: '任务与审计', icon: Activity },
    { routes: ['settings'], label: '平台设置', icon: Settings2 },
  ],
];

function AdminNavigation({ page }: { page: string }) {
  const { setOpenMobile } = useSidebar();
  const attention = useAdminOverview().data?.taskCounts.attention ?? 0;
  return (
    <>
      {navigation.map((items, index) => (
        <SidebarGroup key={index}>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => (
                <SidebarMenuItem key={item.routes[0]}>
                  <SidebarMenuButton
                    isActive={item.routes.includes(page)}
                    render={<NavLink to={'/admin/' + item.routes[0]} onClick={() => setOpenMobile(false)} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {item.routes[0] === 'tasks' && attention > 0 ? (
                    <SidebarMenuBadge className="text-warning-foreground">{attention}</SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

export function AdminLayout({ title }: { title: string }) {
  const page = useLocation().pathname.split('/')[2] || 'overview';
  const current = navigation.flat().find(item => item.routes.includes(page));
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader className="px-4 pt-4 pb-2">
          <Brand title={title} />
        </SidebarHeader>
        <SidebarContent>
          <AdminNavigation page={page} />
        </SidebarContent>
        <SidebarFooter>
          <AccountMenu
            side="top"
            trigger={
              <MenuTrigger render={<SidebarMenuButton />}>
                <span className="flex-1 truncate text-left font-medium">管理员</span>
                <ChevronsUpDown className="ms-auto size-4 opacity-60" />
              </MenuTrigger>
            }
          />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ms-1" aria-label="切换导航" />
          <Breadcrumb className="ms-1 min-w-0">
            <BreadcrumbList>
              <BreadcrumbItem className="max-sm:hidden">
                <BreadcrumbLink render={<NavLink to="/admin/overview" />}>管理控制台</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="max-sm:hidden" />
              <BreadcrumbItem>
                <h1>
                  <BreadcrumbPage className="font-medium">{current?.label ?? '总览'}</BreadcrumbPage>
                </h1>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div ref={setSlot} className="ms-auto flex shrink-0 items-center gap-2" />
        </header>
        <HeaderSlot.Provider value={slot}>
          <main className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 p-4 sm:p-6">
            <Outlet />
          </main>
        </HeaderSlot.Provider>
      </SidebarInset>
    </SidebarProvider>
  );
}
