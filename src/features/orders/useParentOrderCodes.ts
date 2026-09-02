import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type ContinuableRow = {
  id: string;
  order_code: string;
  continues_order_id?: string | null;
};

/**
 * Order code of the order each continuation continues from.
 *
 * Deliberately not `OrderLineage`: that walks `continues_order_id` upward one
 * query per hop, which is fine for a detail page and catastrophic in a list —
 * 25 rows would fire 25 independent chains.
 *
 * Almost every parent is already on screen. A continuation is created with the
 * same doctor and the same patient as its parent, and these pages fetch the
 * whole set client-side, so the parent is nearly always in the array already;
 * the map costs nothing.
 *
 * The exception is a filtered list — the lab's edited-orders page only fetches
 * orders that have edits, so a parent that was never edited is missing. Those
 * are collected and fetched in ONE batched query for the whole page, never one
 * per row.
 */
export function useParentOrderCodes(rows: ContinuableRow[]): Map<string, string> {
  const known = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.id, r.order_code);
    return m;
  }, [rows]);

  // Parents referenced by a row on this page that the page didn't itself load.
  const missing = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.continues_order_id && !known.has(r.continues_order_id)) {
        ids.add(r.continues_order_id);
      }
    }
    return [...ids].sort();
  }, [rows, known]);

  const { data: fetched } = useQuery({
    // Keyed on the ids themselves, so paging to a set with the same gaps reuses
    // the result instead of refetching.
    queryKey: ['order-parent-codes', missing],
    enabled: missing.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_code')
        .in('id', missing);
      // A parent hidden by RLS or deleted simply doesn't come back; the caller
      // renders the badge without a code rather than pretending the order isn't
      // a continuation.
      if (error) return [] as { id: string; order_code: string }[];
      return (data ?? []) as { id: string; order_code: string }[];
    },
  });

  return useMemo(() => {
    const m = new Map(known);
    for (const row of fetched ?? []) m.set(row.id, row.order_code);
    return m;
  }, [known, fetched]);
}
