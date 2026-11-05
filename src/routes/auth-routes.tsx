import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthLayout } from '@/layouts/auth-layout';
import { AdminLoginPage } from '@/pages/auth/admin-login';
import { ClaimPage } from '@/pages/auth/claim';
import { LoginPage } from '@/pages/auth/login';
import { SetupPage } from '@/pages/auth/setup';

/** Signed-out routes. A protected deep link is remembered in `state.from` and restored after login. */
export function AuthRoutes({ title, initialized }: { title: string; initialized: boolean }) {
  const { pathname, search } = useLocation();
  const protectedPath = pathname.startsWith('/admin/') || pathname.startsWith('/student/');
  return (
    <Routes>
      <Route element={<AuthLayout title={title} />}>
        {initialized ? (
          <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/claim" element={<ClaimPage />} />
            <Route path="/login/admin" element={<AdminLoginPage />} />
          </>
        ) : (
          <Route path="/setup" element={<SetupPage />} />
        )}
      </Route>
      <Route
        path="*"
        element={
          <Navigate
            replace
            to={initialized ? '/login' : '/setup'}
            state={protectedPath ? { from: pathname + search } : undefined}
          />
        }
      />
    </Routes>
  );
}
