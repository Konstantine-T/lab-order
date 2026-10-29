import { supabase } from '@/lib/supabase';
import { DESTINATION_SELECT, type DestinationColumns } from '@/features/lab/orders/queueFilters';
import type { LabProjectRow, OrderRow } from '@/types/database';

/**
 * The lab's "projects" (5XVmpHyN): one per patient record with orders at this
 * lab. The list comes from `lab_projects` (0055), which groups server-side;
 * a project's own page reads the orders directly.
 *
 * Every order read here filters `lab_id` AND `patient_id` explicitly, and
 * drops the lab's trashed orders (0054). Since 0048 a lab owner also reads
 * its own purchases from other labs through the doctor policies, so RLS alone
 * would mix them in. The `order_trash(id)` embed returns only the caller's own
 * side's rows (0054's RLS), so "no embedded row" is "not in this lab's trash";
 * an order cannot be both this lab's incoming order and its own purchase
 * (0048 refuses ordering from yourself and freezes lab_id / doctor_id).
 */

export const PROJECTS_PAGE_SIZE = 25;

export const labProjectsKey = (labId: string | undefined, search: string, page: number) =>
  ['lab-projects', labId, search, page] as const;
export const labProjectKey = (labId: string | undefined, patientId: string | undefined) =>
  ['lab-project', labId, patientId] as const;
export const labProjectOrdersKey = (labId: string | undefined, patientId: string | undefined) =>
  ['lab-project-orders', labId, patientId] as const;

/** One page of projects, most recently active first. */
export async function fetchLabProjects(search: string, page: number): Promise<LabProjectRow[]> {
  const { data, error } = await supabase.rpc('lab_projects', {
    p_search: search.trim() || null,
    p_limit: PROJECTS_PAGE_SIZE,
    p_offset: (page - 1) * PROJECTS_PAGE_SIZE,
  });
  if (error) throw error;
  return ((data ?? []) as LabProjectRow[]).map((r) => ({
    ...r,
    order_count: Number(r.order_count),
    open_count: Number(r.open_count),
    total_count: Number(r.total_count),
  }));
}

/** A route parameter that can be a patient id at all. Anything else is "not
 *  found" without a round trip (Postgres would refuse it as a uuid). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPatientId = (v: string | undefined): v is string => !!v && UUID_RE.test(v);

/** The header of a project: its patient and its latest order's doctor and
 *  clinic, as the list row shows them (snapshots, not live rows). */
export type LabProjectHead = DestinationColumns & {
  buyer_lab_id: string | null;
  doctor_snapshot: OrderRow['doctor_snapshot'] | null;
  patients: { first_name: string; last_name: string; date_of_birth: string | null } | null;
};

/** Null when this lab has no (untrashed) order for the patient: another
 *  lab's patient, the lab's own purchase, a wrong id, or everything trashed. */
export async function fetchLabProjectHead(
  labId: string,
  patientId: string,
): Promise<LabProjectHead | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      `buyer_lab_id, doctor_snapshot, ${DESTINATION_SELECT}, ` +
        'patients(first_name, last_name, date_of_birth), order_trash(id)',
    )
    .eq('lab_id', labId)
    .eq('patient_id', patientId)
    .is('order_trash', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as LabProjectHead | null;
}

export type LabProjectOrder = Pick<
  OrderRow,
  | 'id'
  | 'order_code'
  | 'status'
  | 'final_total'
  | 'requested_due_date'
  | 'confirmed_due_date'
  | 'requested_due_time'
  | 'confirmed_due_time'
  | 'created_at'
> & {
  service_snapshot: { name?: string } | null;
  lab_services: { name: string } | null;
};

/** Everything this lab has for the patient, newest first. */
export async function fetchLabProjectOrders(
  labId: string,
  patientId: string,
): Promise<LabProjectOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_code, status, final_total, requested_due_date, confirmed_due_date, ' +
        'requested_due_time, confirmed_due_time, created_at, service_snapshot, ' +
        'lab_services(name), order_trash(id)',
    )
    .eq('lab_id', labId)
    .eq('patient_id', patientId)
    .is('order_trash', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LabProjectOrder[];
}

/** "Nino Beridze": the two names, trimmed. */
export const projectPatientName = (p: { first_name?: string | null; last_name?: string | null }) =>
  [p.first_name?.trim(), p.last_name?.trim()].filter(Boolean).join(' ');

/** "Smile Center · Saburtalo": the clinic, with its branch when there is one. */
export const projectClinicLine = (clinic: string | null, branch: string | null) =>
  [clinic?.trim(), branch?.trim()].filter(Boolean).join(' · ');
