import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { OrderStatus } from '@/types/database';
import { trashCountKey, trashListKey, type TrashScope } from './trashApi';

/**
 * A side's trash: its orders whose `order_trash` row is still before
 * `purge_after`.
 *
 * Read from `orders`, scoped like every other list of that side: the lab's
 * incoming orders by `lab_id`, the doctor's or a buying lab's by `doctor_id`
 * (the 0048 rule: a lab owner reads both through RLS). `order_trash!inner`
 * keeps only the orders with a row the caller can read, and RLS shows a
 * caller only its own side's rows, so with that scope the row is this side's.
 * The side is filtered too, to say so.
 *
 * "Now" is the browser's clock. A row the server already counts as gone can
 * show for as long as the clocks disagree; Restore on it then says
 * `trash_expired`, translated, and the list refetches.
 */
const scopeFilter = (scope: TrashScope) =>
  scope.side === 'LAB'
    ? { column: 'lab_id', value: scope.labId }
    : { column: 'doctor_id', value: scope.doctorId };

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

type OrderWithTrash = TrashListRow['orders'] & {
  order_trash: { id: string; deleted_at: string; purge_after: string }[];
};

const LIST_SELECT =
  'id, order_code, status, buyer_lab_id, patient_id, patient_reference, doctor_snapshot, ' +
  'lab_name:lab_snapshot->>public_name, service_name:service_snapshot->>name, ' +
  'patients(first_name, last_name), order_trash!inner(id, deleted_at, purge_after)';

export function useTrashList(scope: TrashScope | null) {
  return useQuery({
    queryKey: scope ? trashListKey(scope) : ['order-trash', 'none'],
    enabled: !!scope,
    queryFn: async () => {
      const f = scopeFilter(scope!);
      const { data, error } = await supabase
        .from('orders')
        .select(LIST_SELECT)
        .eq(f.column, f.value)
        .eq('order_trash.side', scope!.side)
        .gt('order_trash.purge_after', new Date().toISOString());
      if (error) throw error;
      const rows: TrashListRow[] = [];
      for (const o of (data ?? []) as unknown as OrderWithTrash[]) {
        const t = o.order_trash?.[0];
        if (!t) continue;
        rows.push({
          id: t.id,
          order_id: o.id,
          deleted_at: t.deleted_at,
          purge_after: t.purge_after,
          orders: o,
        });
      }
      // Most recently deleted first. Not `.order()`: PostgREST cannot sort
      // the orders by a column of their to-many `order_trash` embed.
      return rows.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    },
  });
}

/** "Trash (N)": counted, no rows on the wire. Fails soft to 0. */
export function useTrashCount(scope: TrashScope | null) {
  const { data = 0 } = useQuery({
    queryKey: scope ? trashCountKey(scope) : ['order-trash-count', 'none'],
    enabled: !!scope,
    queryFn: async () => {
      const f = scopeFilter(scope!);
      const { count, error } = await supabase
        .from('orders')
        .select('id, order_trash!inner(id)', { count: 'exact', head: true })
        .eq(f.column, f.value)
        .eq('order_trash.side', scope!.side)
        .gt('order_trash.purge_after', new Date().toISOString());
      if (error) return 0;
      return count ?? 0;
    },
  });
  return data;
}
