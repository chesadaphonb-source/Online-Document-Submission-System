import { createBrowserRouter, Navigate } from 'react-router';
import { LoginPage } from './components/auth/LoginPage';
import { AppLayout } from './components/layout/AppLayout';
import { StudentDashboard } from './components/student/StudentDashboard';
import { SubmitForm } from './components/student/SubmitForm';
import { TrackStatus } from './components/student/TrackStatus';
import { TeacherDashboard } from './components/teacher/TeacherDashboard';
import { ApprovalList } from './components/teacher/ApprovalList';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminInbox } from './components/admin/AdminInbox';
import { FormManager } from './components/admin/FormManager';
import { UserManager } from './components/admin/UserManager';
import { DocumentFlow } from './components/admin/DocumentFlow';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', Component: LoginPage },
  {
    path: '/student',
    element: <AppLayout role="student" />,
    children: [
      { index: true, element: <Navigate to="/student/dashboard" replace /> },
      { path: 'dashboard', Component: StudentDashboard },
      { path: 'submit', Component: SubmitForm },
      { path: 'track', Component: TrackStatus },
    ],
  },
  {
    path: '/teacher',
    element: <AppLayout role="teacher" />,
    children: [
      { index: true, element: <Navigate to="/teacher/dashboard" replace /> },
      { path: 'dashboard', Component: TeacherDashboard },
      { path: 'approvals', Component: ApprovalList },
    ],
  },
  {
    path: '/admin',
    element: <AppLayout role="admin" />,
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'dashboard', Component: AdminDashboard },
      { path: 'inbox', Component: AdminInbox },
      { path: 'flow', Component: DocumentFlow },
      { path: 'forms', Component: FormManager },
      { path: 'users', Component: UserManager },
    ],
  },
]);

