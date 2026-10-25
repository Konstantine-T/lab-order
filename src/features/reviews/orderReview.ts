import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import type { LabReviewRow, OrderRow } from '@/types/database';
import { REVIEW_COLUMNS } from './reviewQueries';

/** How long after completion a doctor may write a review (0044, J1). */
export const REVIEW_WINDOW_DAYS = 30;

/** The last moment a new review can be written, or null when none can. */
export function reviewDeadline(order: Pick<OrderRow, 'status' | 'completed_at'>): dayjs.Dayjs | null {
  if (order.status !== 'COMPLETED' || !order.completed_at) return null;
  const until = dayjs(order.completed_at).add(REVIEW_WINDOW_DAYS, 'day');
  return dayjs().isAfter(until) ? null : until;
}

/** The doctor's own review of one order (RLS returns only their own). */
export function useOrderReview(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order-review', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_reviews')
        .select(REVIEW_COLUMNS)
        .eq('order_id', orderId!)
        .maybeSingle();
      // Not there yet (a database before 0044) reads as "no review".
      if (error) return null;
      return (data as LabReviewRow | null) ?? null;
    },
  });
}
