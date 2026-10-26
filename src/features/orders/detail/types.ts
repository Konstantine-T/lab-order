import type { OrderRow } from '@/types/database';

/**
 * The order row as both detail screens load it.
 *
 * `labs` is the live row, not the snapshot: you call or email a lab at the
 * number and address it has now. Its name, on the other hand, is read from
 * `lab_snapshot` like every other historical fact.
 */
export type DetailOrder = OrderRow & {
  patients: {
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    gender?: string | null;
  } | null;
  labs: {
    contact_email: string | null;
    contact_phone?: string | null;
    logo_url?: string | null;
  } | null;
};

/**
 * The select behind `DetailOrder`, and the only one `['order', id]` may be
 * fetched with: the doctor's detail page and the edit page share that key. A
 * narrower select on either would reach the other too — saving an edit
 * refetches the key just as the detail page mounts, and the detail page then
 * keeps that result, lab phone and logo missing.
 *
 * `labs!orders_lab_id_fkey`, never a bare `labs(...)`: since 0048 `orders`
 * has a second key to `labs` (`buyer_lab_id`), and PostgREST refuses an
 * ambiguous embed (PGRST201), failing the whole read.
 */
export const DETAIL_ORDER_SELECT =
  '*, patients(first_name, last_name, date_of_birth, gender), ' +
  'labs!orders_lab_id_fkey(contact_email, contact_phone, logo_url)';

export const labNameOf = (order: OrderRow) =>
  (order.lab_snapshot as { public_name?: string } | null)?.public_name ?? '';

export const serviceNameOf = (order: OrderRow) =>
  (order.service_snapshot as { name?: string } | null)?.name ?? '';

export const patientNameOf = (order: DetailOrder) =>
  order.patients ? `${order.patients.first_name} ${order.patients.last_name}`.trim() : '';

/**
 * The header's patient line. A lab's purchase may have no patient (0048):
 * then its free-text reference, labelled as one, else a dash. A purchase with
 * both keeps the reference alongside the name (`reference`), so the buying
 * lab still sees the case reference it typed once the order is closed.
 */
export function patientLineOf(
  order: DetailOrder,
): { kind: 'patient' | 'reference'; text: string; reference?: string } | null {
  const name = patientNameOf(order);
  const reference = order.patient_reference?.trim() || undefined;
  if (name) return { kind: 'patient', text: name, reference };
  if (order.patient_id) return null;
  return reference ? { kind: 'reference', text: reference } : { kind: 'patient', text: '—' };
}

export const isTerminal = (order: OrderRow) =>
  order.status === 'COMPLETED' || order.status === 'CANCELLED';
