import { useAuth } from '@/auth/AuthProvider';
import { PURCHASE_PATHS, useBuyerMode } from '@/features/labBuying/buyerMode';
import { TrashPage } from '@/features/orders/trash/TrashPage';

/**
 * `/doctor/trash`, or with `buyer` a lab's `/lab/purchases/trash` (0054, side
 * DOCTOR): the doctor's own orders, or the buying profile's purchases, that
 * were deleted. Scoped by the route's prop, never by role: a lab owner's
 * incoming trash is `/lab/trash`.
 */
export function DoctorTrashPage({ buyer: buyerProp = false }: { buyer?: boolean } = {}) {
  const { user } = useAuth();
  const buyer = useBuyerMode(buyerProp);
  const doctorId = buyerProp ? (buyer?.profileId ?? null) : (user?.doctor_profile?.id ?? null);
  return (
    <TrashPage
      scope={doctorId ? { side: 'DOCTOR', doctorId } : null}
      ordersPath={buyerProp ? PURCHASE_PATHS.orders : '/doctor/orders'}
    />
  );
}
