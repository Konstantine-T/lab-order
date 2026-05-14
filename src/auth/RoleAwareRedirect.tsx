import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { FullPageSpinner } from '@/components/FullPageSpinner';

export function RoleAwareRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  switch (user.role) {
    case 'DOCTOR':
      return <Navigate to="/doctor" replace />;
    case 'LAB_MAIN_ADMIN':
      return <Navigate to="/lab" replace />;
    case 'PLATFORM_ADMIN':
      return <Navigate to="/admin" replace />;
    case 'CLINIC_ADMIN':
      return <Navigate to="/clinic" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}
