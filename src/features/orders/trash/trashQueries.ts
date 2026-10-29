import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { OrderStatus } from '@/types/database';
import { trashCountKey, trashListKey, type TrashScope } from './trashApi';

/**
 * A side's trash: its `order_trash` rows still in the trash, with their
 * orders.
 *
 * Read from `order_trash`, with the order embedded (`orders!inner`), so the
 * server sorts by `deleted_at` and pages: PostgREST's row cap can never cut
 * the list, and the pager and "Empty trash" count with `useTrashCount`, over
 * every row, not over one page.
 *
 * Scoped on the embedded order like every other list of that side: the lab's
 * incoming orders by `lab_id`, the doctor's or a buying lab's by `doctor_id`
 * (the 0048 rule: a lab owner reads both through RLS). RLS shows a caller
 * only its own side's rows, and no cleared (restored or reopened) one; the
 * side is filtered too, to say so.
 *
 * "Still in the trash" = not purged, and `purge_after` ahead of this clock.
 * `purged_at` takes "Delete now" / "Empty trash" off at once, even in a
 * browser whose clock runs behind the server's (purge_after is then the
 * server's now(), which that clock has not reached yet). Only the 14 days
 * running out by themselves are judged by this clock: such a row can show
 * for as long as the clocks disagree, and Restore on it then says
 * `trash_expired`, translated, and the list refetches.
 */
export const TRASH_PAGE_SIZE = 25;

const scopeFilter = (scope: TrashScope) =>
  scope.side === 'LAB'
    ? { column: 'orders.lab_id', value: scope.labId }
    : { column: 'orders.doctor_id', value: scope.doctorId };

export type TrashListRow = {
  /** The trash row's id. */
  id: string;
  order_id: string;
  deleted_at: string;
  purge_after: string;
  orders: {
    id: string;
    order_code: string;
    status: OrderStatus;
    buyer_lab_id: string | null;
    patient_id: string | null;
    patient_reference: string | null;
    doctor_snapshot: { first_name?: string; last_name?: string } | null;
    lab_name: string | null;
    service_name: string | null;
    patients: { first_name: string; last_name: string } | null;
  };
};

const LIST_SELECT =
  'id, order_id, deleted_at, purge_after, ' +
  'orders!inner(id, order_code, status, buyer_lab_id, patient_id, patient_reference, doctor_snapshot, ' +
  'lab_name:lab_snapshot->>public_name, service_name:service_snapshot->>name, ' +
  'patients(first_name, last_name))';

/** One page (0-based) of the trash, most recently deleted first. */
export function useTrashList(scope: TrashScope | null, page: number) {
  return useQuery({
    queryKey: scope ? [...trashListKey(scope), page] : ['order-trash', 'none'],
    enabled: !!scope,
    // The previous page stays up while the next one loads.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const f = scopeFilter(scope!);
      const from = page * TRASH_PAGE_SIZE;
      const { data, error } = await supabase
        .from('order_trash')
        .select(LIST_SELECT)
        .eq('side', scope!.side)
        .eq(f.column, f.value)
        .is('purged_at', null)
        .gt('purge_after', new Date().toISOString())
        .order('deleted_at', { ascending: false })
        .order('id')
        // No count on this request: past the end PostgREST would answer 416.
        .range(from, from + TRASH_PAGE_SIZE - 1);
      if (error) throw error;
      return ((data ?? []) as unknown as TrashListRow[]).filter((r) => r.orders);
    },
  });
}

/** "Trash (N)", the trash page's pager and "Empty trash": counted over the
 *  whole trash, no rows on the wire. Fails soft to 0. */
export function useTrashCount(scope: TrashScope | null) {
  const { data = 0 } = useQuery({
    queryKey: scope ? trashCountKey(scope) : ['order-trash-count', 'none'],
    enabled: !!scope,
    queryFn: async () => {
      const f = scopeFilter(scope!);
      const { count, error } = await supabase
        .from('order_trash')
        .select('id, orders!inner(id)', { count: 'exact', head: true })
        .eq('side', scope!.side)
        .eq(f.column, f.value)
        .is('purged_at', null)
        .gt('purge_after', new Date().toISOString());
      if (error) return 0;
      return count ?? 0;
    },
  });
  return data;
}
