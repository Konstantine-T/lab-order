import { supabase } from '@/lib/supabase';
import type { OrderClarificationRow } from '@/types/database';

export const clarificationsKey = (orderId: string) => ['order-clarifications', orderId] as const;

/** Newest first — the open question, if there is one, is always [0]. */
export async function fetchClarifications(orderId: string): Promise<OrderClarificationRow[]> {
  const { data, error } = await supabase
    .from('order_clarifications')
    .select('*')
    .eq('order_id', orderId)
    .order('asked_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrderClarificationRow[];
}

/** Asks the question AND moves the order to NEEDS_CLARIFICATION, in one call. */
export async function requestClarification(orderId: string, question: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_clarification', {
    p_order_id: orderId,
    p_question: question,
  });
  if (error) throw error;
  return data as string;
}

/** Does not touch the order's status — the lab moves it on by hand. */
export async function answerClarification(
  clarificationId: string,
  answer: string,
): Promise<void> {
  const { error } = await supabase.rpc('answer_clarification', {
    p_clarification_id: clarificationId,
    p_answer: answer,
  });
  if (error) throw error;
}

export type ClarificationErrorKind =
  | 'terminal'
  | 'alreadyAnswered'
  | 'alreadyOpen'
  | 'permission'
  | 'generic';

/**
 * Map whatever the RPC raised onto something translatable.
 *
 * Matching is on the message text because the functions raise bare codes
 * (`order_terminal`, `not_your_lab`, …) which all arrive as P0001. Same rule as
 * orderFilesApi: never render the raw Postgres string — it is English-only and
 * talks about row-level security at the user.
 */
export function classifyClarificationError(err: unknown): ClarificationErrorKind {
  const msg = String((err as { message?: string })?.message ?? '').toLowerCase();

  if (msg.includes('order_terminal')) return 'terminal';
  if (msg.includes('already_answered')) return 'alreadyAnswered';
  if (msg.includes('clarification_already_open')) return 'alreadyOpen';
  if (
    msg.includes('not_your_lab') ||
    msg.includes('not_your_order') ||
    msg.includes('row-level security') ||
    msg.includes('permission')
  ) {
    return 'permission';
  }
  return 'generic';
}
