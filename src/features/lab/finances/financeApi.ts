import { supabase } from '@/lib/supabase';
import type {
  InvoiceRecipientType,
  LabReceivableCustomer,
  LabReceivableOrder,
  PaymentStatus,
} from '@/types/database';

export type ReceivableSort =
  | 'created_desc'
  | 'created_asc'
  | 'outstanding_desc'
  | 'outstanding_asc'
  | 'due_asc'
  | 'due_desc';

export const RECEIVABLE_SORTS: readonly ReceivableSort[] = [
  'created_desc',
  'created_asc',
  'outstanding_desc',
  'outstanding_asc',
  'due_asc',
  'due_desc',
] as const;

/** UI filter state for the finances page. */
export type ReceivableFilters = {
  search: string;
  recipientType: InvoiceRecipientType | null;
  customerId: string | null;
  statuses: PaymentStatus[];
  dateFrom: string | null; // YYYY-MM-DD
  dateTo: string | null; // YYYY-MM-DD
  overdueOnly: boolean;
  minAmount: number | null;
  maxAmount: number | null;
};

/** Default view: everything still owed (unpaid + partially paid). */
export const defaultReceivableFilters: ReceivableFilters = {
  search: '',
  recipientType: null,
  customerId: null,
  statuses: ['UNPAID', 'PARTIALLY_PAID'],
  dateFrom: null,
  dateTo: null,
  overdueOnly: false,
  minAmount: null,
  maxAmount: null,
};

/** Map UI filter state to the shared p_* RPC arguments. */
function filterParams(labId: string, f: ReceivableFilters) {
  return {
    p_lab_id: labId,
    p_search: f.search.trim() || null,
    p_recipient_type: f.recipientType,
    p_customer_id: f.customerId,
    p_statuses: f.statuses.length ? f.statuses : null,
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
