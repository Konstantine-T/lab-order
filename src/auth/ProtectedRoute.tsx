import type { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { publicEquivalent } from '@/features/public/publicRoutes';

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!session) {
    // The catalogue has a logged-out copy; send a guest there instead of to
    // the sign-in form, and let them come back with an account when they
    // actually need one. Everything else keeps the bounce-and-return.
    const open = publicEquivalent(location.pathname, location.search);
    if (open) return <Navigate to={open} replace />;
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
