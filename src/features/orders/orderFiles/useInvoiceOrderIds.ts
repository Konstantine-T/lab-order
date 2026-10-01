import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const EMPTY: ReadonlySet<string> = new Set<string>();

/**
 * The ids of orders that carry an invoice, for one list page. The one query
 * behind both the lab's "invoice" mark and the doctor's and clinic's "new
 * invoice" badge (`useUnacknowledgedInvoices` is a thin wrapper over it).
 *
 * - Lab (`labId`, `unacknowledgedOnly: false`): every order it has invoiced.
 *   A permanent, neutral fact — the lab attached the thing, so there is
 *   nothing for it to acknowledge.
 * - Doctor / clinic (`unacknowledgedOnly: true`): only the invoices they have
 *   not seen yet, including ones replaced since they last looked.
 *
 * One query per page, not per row. The alternative — embedding `order_files`
 * in the list query — either drags every attachment of every order across the
 * wire, or relies on PostgREST's embedded-filter join semantics, which differ
 * between `!inner` and `!left` and between versions. This asks the narrow
 * question directly and returns only ids.
 *
 * The acknowledgement test is done here in JS, not as a filter: PostgREST
 * cannot compare two columns, and a replace deliberately leaves the old
 * acknowledgement in place (that is what tells "changed" from "attached"), so
 * a plain `is null` filter would miss every replaced invoice. The rows fetched
 * are only the orders that have an invoice at all, which is a small set.
 */
export function useInvoiceOrderIds(scope: {
  doctorId?: string;
  labId?: string;
  unacknowledgedOnly: boolean;
  enabled?: boolean;
}): ReadonlySet<string> {
  const { doctorId, labId, unacknowledgedOnly, enabled = true } = scope;

  const { data } = useQuery({
    // The 'unacknowledged-invoices' prefix is shared on purpose: attaching or
    // replacing an invoice (LabInvoiceControl) and acknowledging one both
    // invalidate that prefix, so the lab sees its new invoice on the list as
    // soon as it comes back from the order sheet rather than up to 30s later.
    // The rest of the key carries the scope and the flag, so a lab's answer is
    // never served to a doctor signed in later in the same tab.
    queryKey: [
      'unacknowledged-invoices',
      labId ? `lab:${labId}` : doctorId ? `doctor:${doctorId}` : 'clinic',
      unacknowledgedOnly ? 'unseen' : 'all',
    ],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('orders')
        // `!inner` narrows to orders that have an invoice.
        .select('id, invoice_acknowledged_at, order_files!inner(created_at)')
        .eq('order_files.file_source', 'INVOICE');
      if (labId) q = q.eq('lab_id', labId);
      if (doctorId) q = q.eq('doctor_id', doctorId);
      // Newest first, like the list queries. Past PostgREST's row cap both are
      // cut at the same end, so every invoiced order among the rows a list
      // shows is still in this set.
      const { data, error } = await q.order('created_at', { ascending: false });
      // A badge is not worth breaking the list over.
      if (error) return EMPTY;

      const rows = (data ?? []) as {
        id: string;
        invoice_acknowledged_at: string | null;
        order_files: { created_at: string }[];
      }[];
      if (!unacknowledgedOnly) return new Set(rows.map((r) => r.id));

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

  return data ?? EMPTY;
}
