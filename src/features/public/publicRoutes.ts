/**
 * The logged-out catalogue: the same three screens a doctor has under
 * `/doctor`, reachable without an account.
 *
 * Distinct URLs rather than the doctor's own, so nothing under `/doctor/*`
 * changes — every existing nav item, link and bookmark keeps working. The cost
 * is two addresses for one page, which `GuestRoute` settles by sending a
 * signed-in visitor to their own area's copy.
 */
export const PUBLIC_ROUTES = {
  landing: '/',
  marketplace: '/labs',
  lab: (labId: string) => `/labs/${labId}`,
  orderNew: '/order/new',
} as const;

/**
 * Where the marketplace, a lab's profile and the wizard link to, for whoever
 * is looking. The doctor and the clinic share one shape under their base
 * path; the guest has their own.
 */
export function catalogPaths(guest: boolean, basePath: string) {
  if (guest) {
    return {
      marketplace: PUBLIC_ROUTES.marketplace,
      lab: PUBLIC_ROUTES.lab,
      orderNew: PUBLIC_ROUTES.orderNew,
    };
  }
  return {
    marketplace: `${basePath}/marketplace`,
    lab: (labId: string) => `${basePath}/labs/${labId}`,
    orderNew: `${basePath}/orders/new`,
  };
}

/**
 * The guest copy of a doctor catalogue URL, or null when there is none.
 *
 * `ProtectedRoute` uses this so that a visitor without a session who opens
 * `/doctor/marketplace`, a lab's page or a service's order form — from a
 * shared link, an old bookmark, or the design's own hrefs — is sent to the
 * page they can actually use rather than to the sign-in form. Anything else
 * under `/doctor` (orders, patients, profile) has no public equivalent and
 * still goes to sign-in.
 */
export function publicEquivalent(pathname: string, search: string): string | null {
  if (pathname === '/doctor/marketplace') return PUBLIC_ROUTES.marketplace;
  const lab = pathname.match(/^\/doctor\/labs\/([^/]+)$/);
  if (lab) return PUBLIC_ROUTES.lab(lab[1]) + search;
  if (pathname === '/doctor/orders/new') return PUBLIC_ROUTES.orderNew + search;
  return null;
}
