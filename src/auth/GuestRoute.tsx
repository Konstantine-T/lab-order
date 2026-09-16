import type { ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { roleHome } from './roleHome';
import { FullPageSpinner } from '@/components/FullPageSpinner';

/**
 * A public catalogue page, with one canonical address per audience.
 *
 * A guest sees the page. A signed-in visitor is sent to the same screen inside
 * their own area — `authedTo` builds that address for the doctor and the
 * clinic, who both have one; every other role lands on its dashboard.
 *
 * `loading` holds a spinner rather than rendering the guest page: a doctor who
 * opens `/labs` from a bookmark would otherwise see the logged-out marketplace
 * flash before the redirect, and a guest who has just signed in from the
 * wizard's dialog would see their form vanish and come back.
 */
export function GuestRoute({
  children,
  authedTo,
}: {
  children: ReactNode;
  /** The signed-in equivalent of this URL, given the role's base path. */
  authedTo: (ctx: { base: string; params: Record<string, string | undefined>; search: string }) => string;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const params = useParams();

  if (loading) return <FullPageSpinner />;
  if (user) {
    const base = roleHome(user.role);
    const hasCatalogue = user.role === 'DOCTOR' || user.role === 'CLINIC_ADMIN';
    return (
      <Navigate
        to={hasCatalogue ? authedTo({ base, params, search: location.search }) : base}
        replace
      />
    );
  }
  return <>{children}</>;
}
