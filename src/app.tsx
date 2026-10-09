import { lazy, Suspense, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { Activity, ArrowUpRight, Command, HardDrive, LayoutDashboard, ListChecks, LogOut, Network, Settings2, ShieldCheck, Users, PanelLeft } from 'lucide-react';
import type { Actor } from '../shared/schema';
import { request, useCommand } from './lib/api';
import { Feedback, Loading } from './components/common';
import { Button } from './components/ui/button';
import { AuthPage } from './pages/auth';
import { ToastProvider } from './components/ui/toast';
import { TaskNotifications } from './components/task-notifications';
const AdminPage = lazy(() => import('./pages/admin').then(module => ({ default: module.AdminPage })));
const StudentPage = lazy(() => import('./pages/student').then(module => ({ default: module.StudentPage })));

const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 2000 } } });
const navigation = [
  { id: 'overview', label: '总览', icon: LayoutDashboard }, { id: 'students', label: '学生名单', icon: Users },
  { id: 'profiles', label: '资源配置', icon: HardDrive }, { id: 'networks', label: '网络与地址池', icon: Network },
  { id: 'templates', label: '系统模板', icon: ListChecks }, { id: 'forwarding', label: '公网转发', icon: ArrowUpRight },
  { id: 'tasks', label: '任务与审计', icon: Activity }, { id: 'settings', label: '平台设置', icon: Settings2 },
];
function Application() {
  const cache = useQueryClient(), command = useCommand();
  const [menu, setMenu] = useState(false);
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<{ actor: Actor | null; initialized: boolean; title: string }>('auth/session'), refetchInterval: 60000 });
  useEffect(() => { const listener = () => void cache.invalidateQueries({ queryKey: ['session'] }); window.addEventListener('pvedc:unauthorized', listener); return () => window.removeEventListener('pvedc:unauthorized', listener); }, [cache]);
  if (session.isPending) return <Loading/>;
  if (session.error) return <Feedback error={session.error.message}/>;
  if (!session.data.actor) return <AuthPage initialized={session.data.initialized} title={session.data.title}/>;
  const user = session.data.actor;
  return <div className="app-shell"><aside className={'sidebar ' + (menu ? 'sidebar-open' : '')}><NavLink to="/" className="brand"><span className="brand-symbol"><Command/></span><span>{session.data.title}<small>DISTRIBUTION CENTER</small></span></NavLink><div className="nav-section">{user.role === 'admin' ? '资源管理' : '我的空间'}</div><nav>{(user.role === 'admin' ? navigation : [{ id: 'workspace', label: '我的工作台', icon: LayoutDashboard }]).map(item => <NavLink key={item.id} to={'/' + (user.role === 'admin' ? 'admin' : 'student') + '/' + item.id} onClick={() => setMenu(false)} className={({ isActive }) => 'nav-item ' + (isActive ? 'active' : '')}><item.icon/><span>{item.label}</span></NavLink>)}</nav><div className="sidebar-bottom"><div className="sidebar-note"><ShieldCheck/><div>专属计算资源<small>让每一个项目都有运行空间</small></div></div><div className="account"><span className="avatar">{user.role === 'admin' ? '管' : '学'}</span><div>{user.role === 'admin' ? '平台管理员' : user.sub}<small>{user.role === 'admin' ? 'TOTP 身份验证' : '学生账号'}</small></div><Button aria-label="退出登录" variant="ghost" size="icon" loading={command.pending} onClick={() => command.run('auth/logout')}><LogOut/></Button></div></div></aside><div className="main-shell"><header className="topbar"><Button className="mobile-menu" variant="ghost" size="icon" aria-label="打开导航" onClick={() => setMenu(!menu)}><PanelLeft/></Button><div>校园计算资源 <span>/</span> {user.role === 'admin' ? '管理控制台' : '学生工作台'}</div><span className="topbar-pill"><span className="status-dot"/> {user.role === 'admin' ? '管理员' : '学生'}</span></header><main className="page"><Suspense fallback={<Loading/>}><Routes>{user.role === 'admin' ? <Route path="/admin/:page" element={<AdminPage/>}/> : <Route path="/student/workspace" element={<StudentPage studentId={user.sub}/>}/>}<Route path="*" element={<Navigate replace to={user.role === 'admin' ? '/admin/overview' : '/student/workspace'}/>}/></Routes></Suspense></main><footer className="page-footer">PVE Distribution Center <span>为你的下一次创造提供算力</span></footer></div></div>;
}
export function App() { return <QueryClientProvider client={client}><ToastProvider><TaskNotifications/><BrowserRouter><Application/></BrowserRouter></ToastProvider></QueryClientProvider>; }
