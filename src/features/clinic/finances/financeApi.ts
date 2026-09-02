import { supabase } from '@/lib/supabase';
import type {
  ClinicPayableDoctor,
  ClinicPayableOrder,
  InvoiceRecipientType,
  PaymentStatus,
} from '@/types/database';

export type PayableSort =
  | 'created_desc'
  | 'created_asc'
  | 'outstanding_desc'
  | 'outstanding_asc'
  | 'due_asc'
  | 'due_desc';

export const PAYABLE_SORTS: readonly PayableSort[] = [
  'created_desc',
  'created_asc',
  'outstanding_desc',
  'outstanding_asc',
  'due_asc',
  'due_desc',
] as const;

/** UI filter state for the clinic's finances page. */
export type PayableFilters = {
  search: string;
  doctorId: string | null;
  labId: string | null;
  /** Whose invoice it is: billed to the doctor personally, or to the clinic. */
  recipientType: InvoiceRecipientType | null;
  statuses: PaymentStatus[];
  dateFrom: string | null; // YYYY-MM-DD
  dateTo: string | null; // YYYY-MM-DD
  overdueOnly: boolean;
  minAmount: number | null;
  maxAmount: number | null;
};

/**
 * Default view: everything still owed. A clinic opening this page is asking
 * "what do we still have to pay", not "show me every order we ever placed" —
 * the same reasoning as the lab's default.
 */
export const defaultPayableFilters: PayableFilters = {
  search: '',
  doctorId: null,
  labId: null,
  recipientType: null,
  statuses: ['UNPAID', 'PARTIALLY_PAID'],
  dateFrom: null,
  dateTo: null,
  overdueOnly: false,
  minAmount: null,
  maxAmount: null,
};

/** Map UI filter state onto the shared p_* RPC arguments. */
function filterParams(f: PayableFilters) {
  return {
    p_search: f.search.trim() || null,
    p_doctor_id: f.doctorId,
    p_lab_id: f.labId,
    p_recipient_type: f.recipientType,
    p_statuses: f.statuses.length ? f.statuses : null,
    p_date_from: f.dateFrom,
    p_date_to: f.dateTo,
    p_overdue_only: f.overdueOnly,
    p_min_amount: f.minAmount,
    p_max_amount: f.maxAmount,
  };
}

/** Per-doctor rollup over the filtered set (small; the page sums it for totals). */
export async function fetchPayablesByDoctor(f: PayableFilters): Promise<ClinicPayableDoctor[]> {
  const { data, error } = await supabase.rpc('clinic_payables_by_doctor', filterParams(f));
  if (error) throw error;
  return (data ?? []) as ClinicPayableDoctor[];
}

/** One page of payable orders (server sorted and paginated). */
export async function fetchPayablesList(
  f: PayableFilters,
  sort: PayableSort,
  page: number,
  pageSize: number,
): Promise<ClinicPayableOrder[]> {
  const { data, error } = await supabase.rpc('clinic_payables_list', {
    ...filterParams(f),
    p_sort: sort,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw error;
  return (data ?? []) as ClinicPayableOrder[];
}
