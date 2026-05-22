import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { SubmissionsProvider } from './context/SubmissionsContext';
import { SystemProvider } from './context/SystemContext';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <SubmissionsProvider>
          <SystemProvider>
            <RouterProvider router={router} />
            <Toaster richColors position="top-right" />
          </SystemProvider>
        </SubmissionsProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
