/**
 * The order form for one service of one lab — the link behind every "order"
 * button on the lab's profile, for whoever is looking.
 *
 * `orderNew` is `catalogPaths(guest, basePath).orderNew`: `/order/new` for a
 * guest, `/doctor/orders/new` or `/clinic/orders/new` otherwise. The optional
 * params ride along unchanged:
 *   - `doctor`    — the clinic admin's acting doctor;
 *   - `patient`   — a doctor starting a new order for a known patient;
 *   - `continues` — the order a "continue project" flow links lineage to.
 */
export function serviceOrderHref(
  orderNew: string,
  labId: string,
  serviceId: string,
  carry: { doctor?: string | null; patient?: string | null; continues?: string | null } = {},
): string {
  const q = new URLSearchParams({ lab: labId, service: serviceId });
  if (carry.doctor) q.set('doctor', carry.doctor);
  if (carry.patient) q.set('patient', carry.patient);
  if (carry.continues) q.set('continues', carry.continues);
  return `${orderNew}?${q.toString()}`;
}
