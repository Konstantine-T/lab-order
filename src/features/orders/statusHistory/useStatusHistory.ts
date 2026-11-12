import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { supabase } from '@/lib/supabase';
import type { OrderStatusHistoryRow } from '@/types/database';

/** liveQueries maps `order_status_history` rows onto this key. */
export const statusHistoryKey = (orderId: string) => ['order-status-history', orderId] as const;

/**
 * Every status the order has had (0052), newest first. One query per order,
 * shared by the dialog and the "status set …" line under the status.
 */
export function useStatusHistory(orderId: string) {
  return useQuery({
    queryKey: statusHistoryKey(orderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_status_history')
        .select('*')
        .eq('order_id', orderId)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderStatusHistoryRow[];
    },
  });
}

/** "Lab: Dens Lab", "Doctor: Irakli K…", "Platform", "Automatic"; null when unknown. */
export function actorText(row: OrderStatusHistoryRow, t: TFunction): string | null {
  // A reconstructed row with nobody recorded: say nothing rather than "Automatic".
  if (row.actor_role === 'SYSTEM' && row.backfilled) return null;
  const role = t(`statusHistory.role.${row.actor_role}`);
  if (row.actor_role === 'ADMIN' || row.actor_role === 'SYSTEM') return role;
  return row.actor_name ? `${role}: ${row.actor_name}` : role;
}

/** The history's own timestamp format, so the line and the dialog read alike. */
export const HISTORY_TIME_FORMAT = 'YYYY-MM-DD HH:mm';
