import { supabase } from '@/lib/supabase';
import type {
  ClinicPayableDoctor,
  ClinicPayableOrder,
  OrderStatus,
  PaymentStatus,
} from '@/types/database';
import { LIST_FILTER_STATUSES } from '@/features/orders/list/orderListModel';

export type PayableSort =
  | 'created_desc'
  | 'created_asc'
  | 'outstanding_desc'
  | 'outstanding_asc'
  | 'due_asc'
  | 'due_desc'
  | 'completed_desc'
  | 'completed_asc';

export const PAYABLE_SORTS: readonly PayableSort[] = [
  'created_desc',
  'created_asc',
  'outstanding_desc',
  'outstanding_asc',
  'due_asc',
  'due_desc',
  'completed_desc',
  'completed_asc',
] as const;

/**
 * The order statuses the finance filter offers: the clinic's orders list's
 * own, without CANCELLED (no finance figure includes a cancelled order, 0056).
 */
export const PAYABLE_ORDER_STATUSES: readonly OrderStatus[] = LIST_FILTER_STATUSES.filter(
  (s) => s !== 'CANCELLED',
);

/** UI filter state for the clinic's finances page. */
export type PayableFilters = {
  search: string;
  doctorId: string | null;
  labId: string | null;
  /** Payment status. Empty = every one. */
  statuses: PaymentStatus[];
  /** Order status (0056). Empty = every one. */
  orderStatuses: OrderStatus[];
  /** Completed on or after / before, a Tbilisi date (0056). */
  dateFrom: string | null; // YYYY-MM-DD
  dateTo: string | null; // YYYY-MM-DD
  overdueOnly: boolean;
  minAmount: number | null;
  maxAmount: number | null;
};

/**
 * Default view: every order, whatever its payment status, so the "Billed"
 * square is the one selected on arrival; "Outstanding" is one click away.
 */
export const defaultPayableFilters: PayableFilters = {
  search: '',
  doctorId: null,
  labId: null,
  statuses: [],
  orderStatuses: [],
  dateFrom: null,
  dateTo: null,
  overdueOnly: false,
  minAmount: null,
  maxAmount: null,
};

/** How many of the filters behind "More filters" are set. */
export function hiddenPayableFilterCount(f: PayableFilters): number {
  return [
    f.doctorId !== null,
    f.labId !== null,
    f.dateFrom !== null,
    f.dateTo !== null,
    f.minAmount !== null,
    f.maxAmount !== null,
    f.overdueOnly,
  ].filter(Boolean).length;
}

/** Map UI filter state onto the shared p_* RPC arguments. */
function filterParams(f: PayableFilters) {
  return {
    p_search: f.search.trim() || null,
    p_doctor_id: f.doctorId,
    p_lab_id: f.labId,
    // Every clinic order is invoiced to the clinic (0050), so the clinic has
    // no "billed to" to filter by.
    p_recipient_type: null,
    p_statuses: f.statuses.length ? f.statuses : null,
    p_order_statuses: f.orderStatuses.length ? f.orderStatuses : null,
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
