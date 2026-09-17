import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Which of the doctor's orders carry an invoice they have not acknowledged.
 *
 * One query per page, not per row. The alternative — embedding `order_files`
 * in the list query — either drags every attachment of every order across the
 * wire, or relies on PostgREST's embedded-filter join semantics, which differ
 * between `!inner` and `!left` and between versions. This asks the narrow
 * question directly and returns only ids; the set is small by construction
 * because acknowledging removes an order from it.
 *
 * The acknowledgement test is done here in JS, not as a filter: PostgREST
 * cannot compare two columns, and a replace deliberately leaves the old
 * acknowledgement in place (that is what tells "changed" from "attached"), so
 * a plain `is null` filter would miss every replaced invoice. The rows fetched
 * are only the orders that have an invoice at all, which is a small set.
 */
export function useUnacknowledgedInvoices(
  scope: { doctorId?: string; enabled?: boolean } = {},
) {
  const { doctorId, enabled = true } = scope;

  const { data } = useQuery({
    queryKey: ['unacknowledged-invoices', doctorId ?? 'clinic'],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('orders')
        // `!inner` narrows to orders that have an invoice.
        .select('id, invoice_acknowledged_at, order_files!inner(created_at)')
        .eq('order_files.file_source', 'INVOICE');
      if (doctorId) q = q.eq('doctor_id', doctorId);
      const { data, error } = await q;
      // A badge is not worth breaking the list over.
      if (error) return new Set<string>();

      const rows = (data ?? []) as {
        id: string;
        invoice_acknowledged_at: string | null;
        order_files: { created_at: string }[];
      }[];
      return new Set(
        rows
          .filter((r) => {
            const created = r.order_files?.[0]?.created_at;
            if (!created) return false;
            return (
              !r.invoice_acknowledged_at
              || new Date(r.invoice_acknowledged_at) < new Date(created)
            );
          })
          .map((r) => r.id),
      );
    },
  });

  return data ?? new Set<string>();
}
