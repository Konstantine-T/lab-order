import { supabase } from '@/lib/supabase';
import type {
  InvoiceRecipientType,
  LabReceivableCustomer,
  LabReceivableOrder,
  OrderStatus,
  PaymentStatus,
} from '@/types/database';
import { FILTERABLE_STATUSES } from '@/features/lab/orders/orderPresets';

export type ReceivableSort =
  | 'created_desc'
  | 'created_asc'
  | 'outstanding_desc'
  | 'outstanding_asc'
  | 'due_asc'
  | 'due_desc'
  | 'completed_desc'
  | 'completed_asc';

export const RECEIVABLE_SORTS: readonly ReceivableSort[] = [
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
 * The order statuses the finance filter offers: the lab orders page's own
 * list, without CANCELLED (no finance figure includes a cancelled order, 0056).
 */
export const RECEIVABLE_ORDER_STATUSES: readonly OrderStatus[] = FILTERABLE_STATUSES.filter(
  (s) => s !== 'CANCELLED',
);

/** UI filter state for the finances page. */
export type ReceivableFilters = {
  search: string;
  recipientType: InvoiceRecipientType | null;
  customerId: string | null;
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
 * The `finances.filters.*` label for each customer type the receivables RPCs
 * return. 'LAB' is another lab buying from this one (0048): customer_id is
 * the buying lab, customer_name its LLC from the invoice recipient snapshot.
 */
export const CUSTOMER_TYPE_LABEL = {
  DOCTOR: 'doctor',
  CLINIC: 'clinic',
  LAB: 'lab',
} as const satisfies Record<InvoiceRecipientType, string>;

/** Everything still owed: the "Outstanding" square's filter, and what the lab
 *  dashboard's "unpaid" square opens. */
export { OWED_PAYMENT_STATUSES } from '@/features/finances/paymentSquares';

/**
 * Default view: every order with a price, whatever its payment status, so the
 * "Billed" square is the one selected on arrival.
 */
export const defaultReceivableFilters: ReceivableFilters = {
  search: '',
  recipientType: null,
  customerId: null,
  statuses: [],
  orderStatuses: [],
  dateFrom: null,
  dateTo: null,
  overdueOnly: false,
  minAmount: null,
  maxAmount: null,
};

/**
 * How many of the filters behind "More filters" are set: customer type, the
 * completed dates, the amounts, overdue only. The customer picked from the
 * by-customer table is not one of them: it shows as its own chip.
 */
export function hiddenReceivableFilterCount(f: ReceivableFilters): number {
  return [
    f.recipientType !== null,
    f.dateFrom !== null,
    f.dateTo !== null,
    f.minAmount !== null,
    f.maxAmount !== null,
    f.overdueOnly,
  ].filter(Boolean).length;
}

/** Map UI filter state to the shared p_* RPC arguments. */
function filterParams(labId: string, f: ReceivableFilters) {
  return {
    p_lab_id: labId,
    p_search: f.search.trim() || null,
    p_recipient_type: f.recipientType,
    p_customer_id: f.customerId,
    p_statuses: f.statuses.length ? f.statuses : null,
    p_order_statuses: f.orderStatuses.length ? f.orderStatuses : null,
    p_date_from: f.dateFrom,
    p_date_to: f.dateTo,
    p_overdue_only: f.overdueOnly,
    p_min_amount: f.minAmount,
    p_max_amount: f.maxAmount,
  };
}

/** Per-customer rollup over the filtered set (small; client sums for totals). */
export async function fetchReceivablesByCustomer(
  labId: string,
  f: ReceivableFilters,
): Promise<LabReceivableCustomer[]> {
  const { data, error } = await supabase.rpc(
    'lab_receivables_by_customer',
    filterParams(labId, f),
  );
  if (error) throw error;
  return (data ?? []) as LabReceivableCustomer[];
}

/** One page of receivable orders (server sorted/paginated). */
export async function fetchReceivablesList(
  labId: string,
  f: ReceivableFilters,
  sort: ReceivableSort,
  page: number,
  pageSize: number,
): Promise<LabReceivableOrder[]> {
  const { data, error } = await supabase.rpc('lab_receivables_list', {
    ...filterParams(labId, f),
    p_sort: sort,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw error;
  return (data ?? []) as LabReceivableOrder[];
}

/** Set the absolute amount paid on one order; status is derived server-side. */
export async function recordPayment(orderId: string, amountPaid: number): Promise<void> {
  const { error } = await supabase.rpc('record_payment', {
    p_order_id: orderId,
    p_amount_paid: amountPaid,
  });
  if (error) throw error;
}
