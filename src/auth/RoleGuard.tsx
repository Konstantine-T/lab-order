import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import type { UserRole } from '@/types/database';

export function RoleGuard({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}
