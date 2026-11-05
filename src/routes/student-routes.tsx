import { Navigate, Route, Routes } from 'react-router-dom';
import type { Actor } from '../../shared/schema';
import { StudentLayout } from '@/layouts/student-layout';
import { ReturnTo } from './return-path';
import { StudentTasksPage } from '@/pages/student/tasks';
import { WorkspacePage } from '@/pages/student/workspace';

export function StudentRoutes({ title, actor }: { title: string; actor: Actor }) {
  return (
    <Routes>
      <Route path="/student" element={<StudentLayout title={title} actor={actor} />}>
        <Route index element={<Navigate replace to="workspace" />} />
        <Route path="workspace" element={<WorkspacePage studentId={actor.sub} />} />
        <Route path="tasks" element={<StudentTasksPage />} />
      </Route>
      <Route path="*" element={<ReturnTo area="/student/" fallback="/student/workspace" />} />
    </Routes>
  );
}
