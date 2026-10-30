import { lazy, Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import type { Actor } from '../shared/schema';
import { refreshBrowserSession, request } from '@/lib/api';
import { Feedback, Loading } from '@/components/common/feedback';
import { AdminShell, StudentShell } from '@/components/app-shell';
import { AuthPage } from '@/pages/auth';
import { ToastProvider } from '@/components/ui/toast';
import { TaskNotifications } from '@/components/activity/task-notifications';
const AdminPage = lazy(() => import('@/pages/admin').then(module => ({ default: module.AdminPage })));
const StudentPage = lazy(() => import('@/pages/student').then(module => ({ default: module.StudentPage })));
const StudentTasksPage = lazy(() => import('@/pages/student').then(module => ({ default: module.StudentTasksPage })));

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 2000 } },
});
function Application() {
  const cache = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () =>
      request<{
        actor: Actor | null;
        initialized: boolean;
        title: string;
        expiresAt?: number;
        refreshExpiresAt?: number;
      }>('auth/session'),
    refetchInterval: 60000,
  });
  useEffect(() => {
    const listener = () => void cache.invalidateQueries({ queryKey: ['session'] });
    window.addEventListener('pvedc:unauthorized', listener);
    return () => window.removeEventListener('pvedc:unauthorized', listener);
  }, [cache]);
  useEffect(() => {
    const updated = (event: Event) =>
      cache.setQueryData(['session'], (old: Record<string, unknown> | undefined) => ({
        ...old,
        ...(event as CustomEvent).detail,
      }));
    window.addEventListener('pvedc:session-refreshed', updated);
    return () => window.removeEventListener('pvedc:session-refreshed', updated);
  }, [cache]);
  useEffect(() => {
    if (!session.data?.actor || !session.data.expiresAt) return;
    const timer = setTimeout(
      () => {
        void refreshBrowserSession().catch(() => {
          /* The next authenticated request can retry after a temporary outage. */
        });
      },
      Math.max(0, session.data.expiresAt * 1000 - Date.now() - 60000),
    );
    return () => clearTimeout(timer);
  }, [session.data?.actor?.sessionId, session.data?.expiresAt]);
  if (session.isPending) return <Loading />;
  if (session.error) return <Feedback error={session.error.message} />;
  if (!session.data.actor) return <AuthPage initialized={session.data.initialized} title={session.data.title} />;
  const user = session.data.actor;
  const content = (
    <Suspense fallback={<Loading />}>
      <Routes>
        {user.role === 'admin' ? (
          <Route path="/admin/:page" element={<AdminPage />} />
        ) : (
          <>
            <Route path="/student/workspace" element={<StudentPage studentId={user.sub} />} />
            <Route path="/student/tasks" element={<StudentTasksPage />} />
          </>
        )}
        <Route
          path="*"
          element={<Navigate replace to={user.role === 'admin' ? '/admin/overview' : '/student/workspace'} />}
        />
      </Routes>
    </Suspense>
  );
  return user.role === 'admin' ? (
    <AdminShell title={session.data.title}>{content}</AdminShell>
  ) : (
    <StudentShell title={session.data.title} actor={user}>
      {content}
    </StudentShell>
  );
}
export function App() {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TaskNotifications />
        <BrowserRouter>
          <Application />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
