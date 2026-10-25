import type { TFunction } from 'i18next';

/**
 * Why a reviews RPC (0044) failed, as a key of `errors:reviews.*`. Never show
 * the raw Postgres message: it is English-only and names SQL at the user.
 */
const CODES = [
  'not_your_order',
  'order_not_completed',
  'review_window_closed',
  'invalid_rating',
  'comment_required',
  'comment_too_long',
  'not_your_review',
  'not_your_lab',
  'reply_too_long',
  'reason_required',
  'reason_too_long',
  'already_reported',
  'not_platform_admin',
  'review_not_found',
  'note_too_long',
  'invalid_action',
] as const;

export type ReviewErrorCode = (typeof CODES)[number] | 'permission' | 'network' | 'generic';

export function reviewErrorCode(err: unknown): ReviewErrorCode {
  const e = (err ?? {}) as { message?: unknown; code?: unknown };
  const msg = String(e.message ?? '').toLowerCase();
  const code = String(e.code ?? '');
  // The RPCs raise the code itself as the message.
  const known = CODES.find((c) => msg.includes(c));
  if (known) return known;
  if (msg.includes('permission denied') || msg.includes('row-level security') || code === '42501') {
    return 'permission';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) {
    return 'network';
  }
  return 'generic';
}

/** The translated sentence for `err` (pass the `errors` namespace's `t`). */
export function reviewErrorText(err: unknown, t: TFunction): string {
  return t(`reviews.${reviewErrorCode(err)}`);
}
