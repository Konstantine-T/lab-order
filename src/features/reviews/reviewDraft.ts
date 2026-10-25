import { palette2026 } from '@/theme/tokens';

export const COMMENT_MAX = 2000;

/** What the doctor is typing; `rating` is null until a star is picked. */
export type ReviewDraft = { rating: number | null; comment: string };

export const emptyReviewDraft: ReviewDraft = { rating: null, comment: '' };

/** The same rules `save_lab_review` enforces, checked before sending. */
export function reviewDraftError(d: ReviewDraft): 'comment_required' | 'comment_too_long' | null {
  const comment = d.comment.trim();
  if (comment.length > COMMENT_MAX) return 'comment_too_long';
  if (d.rating !== null && d.rating <= 2 && !comment) return 'comment_required';
  return null;
}

/** Filled stars in the brand's gold; the empty ones keep MUI's muted outline. */
export const starSx = { '& .MuiRating-iconFilled': { color: palette2026.gold } } as const;
