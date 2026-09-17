import { useQuery } from '@tanstack/react-query';
import type { OrderFileRow } from '@/types/database';
import { fetchOrderInvoice } from './orderFilesApi';

export const orderInvoiceKey = (orderId: string) => ['order-invoice', orderId] as const;

/**
 * What the doctor should be shown about this order's invoice.
 *
 * All three states fall out of two timestamps rather than a stored flag: the
 * invoice row's own `created_at` versus the order's `invoice_acknowledged_at`.
 * A boolean would have to be maintained by whoever replaces the file, and the
 * moment that write is forgotten the doctor gets a new invoice with no alert.
 *
 * Kept out of OrderInvoice.tsx so that file exports only components — mixing
 * the two costs a react-refresh warning per non-component export.
 */
export function invoiceState(
  invoice: OrderFileRow | null | undefined,
  acknowledgedAt: string | null | undefined,
) {
  const hasInvoice = !!invoice;
  const isUnacknowledged =
    hasInvoice && (!acknowledgedAt || new Date(acknowledgedAt) < new Date(invoice!.created_at));
  return {
    hasInvoice,
    isUnacknowledged,
    /** Already seen an earlier one, so this is a change rather than news. */
    isReplacement: isUnacknowledged && !!acknowledgedAt,
  };
}

export function useOrderInvoice(orderId: string | undefined) {
  return useQuery({
    queryKey: orderInvoiceKey(orderId ?? ''),
    enabled: !!orderId,
    queryFn: () => fetchOrderInvoice(orderId!),
  });
}
