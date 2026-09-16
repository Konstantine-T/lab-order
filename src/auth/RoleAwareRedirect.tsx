import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { roleHome } from './roleHome';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { LandingPage } from '@/pages/public/LandingPage';

/**
 * The root URL. A session goes to its own area; no session gets the landing
 * page rather than a bounce to `/login` — the front door is for people who do
 * not have an account yet as much as for those who do.
 */
export function RoleAwareRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <LandingPage />;
  return <Navigate to={roleHome(user.role)} replace />;
}
