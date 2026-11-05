import { lazy, Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import type { Actor } from '../shared/schema';
import { refreshBrowserSession, request } from '@/lib/api';
import { Feedback, Loading } from '@/components/common/feedback';
import { AuthRoutes } from '@/routes/auth-routes';
import { ToastProvider } from '@/components/ui/toast';
import { TaskNotifications } from '@/components/activity/task-notifications';

// One chunk per role: the layout and its pages arrive together, so their first queries run concurrently.
const AdminRoutes = lazy(() => import('@/routes/admin-routes').then(module => ({ default: module.AdminRoutes })));
const StudentRoutes = lazy(() => import('@/routes/student-routes').then(module => ({ default: module.StudentRoutes })));

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
  if (!session.data.actor) return <AuthRoutes initialized={session.data.initialized} title={session.data.title} />;
  const { actor, title } = session.data;
  return (
    <Suspense fallback={<Loading />}>
      {actor.role === 'admin' ? <AdminRoutes title={title} /> : <StudentRoutes title={title} actor={actor} />}
    </Suspense>
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
