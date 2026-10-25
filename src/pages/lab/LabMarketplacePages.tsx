import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { MarketplacePage } from '@/pages/doctor/MarketplacePage';
import { LabPublicProfilePage } from '@/pages/doctor/LabPublicProfilePage';
import { BuyerProfileGate } from '@/features/labBuying/BuyerProfileGate';
import { PURCHASE_CATALOG_PATHS, PURCHASE_PATHS } from '@/features/labBuying/buyerMode';
import { catalogueQuery } from '@/features/catalog/useCatalogueFilters';

/**
 * The lab's marketplace (0048): `/lab/marketplace` and a lab's page under it.
 *
 * The doctor's own catalogue screens, as the clinic reuses them (both are in
 * the entry chunk already, as the guest catalogue). These wrappers point
 * their links at the lab's prefixes, keep the lab's own lab out of its
 * catalogue, and run the buying-profile check on the way in. The orders it
 * places live under `/lab/purchases` (labPurchasesRoutes.tsx).
 */
export function LabMarketplacePage() {
  const { user } = useAuth();
  return (
    <BuyerProfileGate>
      <MarketplacePage paths={PURCHASE_CATALOG_PATHS} excludeLabId={user?.lab?.id} />
    </BuyerProfileGate>
  );
}

/** A lab's profile in the lab's marketplace. Its own lab is not for sale to itself. */
export function LabMarketplaceLabPage() {
  const { user } = useAuth();
  const { labId } = useParams<{ labId: string }>();
  const [params] = useSearchParams();
  if (labId && labId === user?.lab?.id) {
    return <Navigate to={`${PURCHASE_PATHS.marketplace}${catalogueQuery(params)}`} replace />;
  }
  return (
    <BuyerProfileGate>
      <LabPublicProfilePage paths={PURCHASE_CATALOG_PATHS} />
    </BuyerProfileGate>
  );
}
