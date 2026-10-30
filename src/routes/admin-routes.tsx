import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '@/layouts/admin-layout';
import { ActivityPage } from '@/pages/admin/activity';
import { ForwardingPage } from '@/pages/admin/forwarding';
import { GuidesPage } from '@/pages/admin/guides';
import { NetworksPage } from '@/pages/admin/networks';
import { OverviewPage } from '@/pages/admin/overview';
import { ProfilesPage } from '@/pages/admin/profiles';
import { SettingsPage } from '@/pages/admin/settings';
import { StudentsPage } from '@/pages/admin/students';
import { TemplatesPage } from '@/pages/admin/templates';

/** The whole administrator area ships as one chunk so the layout and the page query in parallel. */
export function AdminRoutes({ title }: { title: string }) {
  return (
    <Routes>
      <Route path="/admin" element={<AdminLayout title={title} />}>
        <Route index element={<Navigate replace to="overview" />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="guides" element={<GuidesPage />} />
        <Route path="profiles" element={<ProfilesPage />} />
        <Route path="networks" element={<NetworksPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="forwarding" element={<ForwardingPage />} />
        <Route element={<ActivityPage />}>
          <Route path="tasks" element={null} />
          <Route path="audit" element={null} />
        </Route>
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate replace to="/admin/overview" />} />
    </Routes>
  );
}
