import { useMemo } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import type { LabRow } from '@/types/database';

/**
 * A lab ordering from another lab (0048, ticket hc61AYfA).
 *
 * Each approved lab has one hidden "buying profile": a doctor_profiles row
 * whose user is the lab owner and whose `buyer_lab_id` is the lab. The lab's
 * purchases area reuses the doctor's own pages (marketplace, lab profile,
 * wizard, orders list, order, edit) the way the clinic area does, and every
 * link inside them stays under the two prefixes below: never `/doctor/...`,
 * and never `/lab/orders/...`, which is the incoming order sheet.
 */
export const PURCHASE_PATHS = {
  marketplace: '/lab/marketplace',
  lab: (labId: string) => `/lab/marketplace/${labId}`,
  orderNew: '/lab/purchases/new',
  /** The purchases list; an order is `${orders}/${id}`, its edit page `/edit` below it. */
  orders: '/lab/purchases',
  /** The purchases this lab deleted (0054). */
  trash: '/lab/purchases/trash',
} as const;

/** The shape `catalogPaths()` returns, which the catalogue pages accept as an override. */
export const PURCHASE_CATALOG_PATHS = {
  marketplace: PURCHASE_PATHS.marketplace,
  lab: PURCHASE_PATHS.lab,
  orderNew: PURCHASE_PATHS.orderNew,
};

/** Only an approved, live lab may buy (the RPCs say the same: `lab_cannot_buy`). */
export function canLabBuy(lab: Pick<LabRow, 'approval_status' | 'is_active'> | null | undefined) {
  return !!lab && lab.approval_status === 'APPROVED_ACTIVE' && lab.is_active;
}

export type BuyerMode = {
  /**
   * The buying profile's id: the `doctor_id` of every purchase order and the
   * filter on every query the purchase pages run. Null until the lab first
   * opens its marketplace, which creates the profile.
   */
  profileId: string | null;
  /** The buying lab itself, as the session loaded it. */
  lab: LabRow;
};

/**
 * Buyer mode for a reused doctor page, or null.
 *
 * `enabled` is the page's own `buyer` prop, set only by the lab's purchase
 * routes: the mode is never inferred from the role, because the lab's own
 * screens share components with the doctor's, and a lab owner on its
 * incoming order sheet must not be treated as a buyer.
 */
export function useBuyerMode(enabled: boolean | undefined): BuyerMode | null {
  const { user } = useAuth();
  const lab = user?.role === 'LAB_MAIN_ADMIN' ? (user.lab ?? null) : null;
  const profileId = user?.buyer_profile?.id ?? null;
  return useMemo(() => (enabled && lab ? { profileId, lab } : null), [enabled, lab, profileId]);
}
