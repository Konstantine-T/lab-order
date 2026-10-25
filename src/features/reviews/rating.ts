/*
 * The public numbers of a lab's reviews (0044's `lab_rating_summary`), as the
 * marketplace card, the landing card and the lab profile read them.
 *
 * Kept tiny and React-free: the guest catalogue and profile are in the entry
 * chunk, and this is all of the reviews feature they carry eagerly.
 */

export type LabRating = {
  /** Visible reviews. */
  count: number;
  /** 1 to 5; null when there are none. */
  average: number | null;
};

/**
 * The `lab_rating_summary(review_count, rating_avg)` embed or row (an object
 * for the one-to-one key, an array on older servers, null for a lab nobody
 * has reviewed). `rating_avg` is numeric, so it may arrive as a string.
 */
export function ratingOf(raw: unknown): LabRating | null {
  const row = (Array.isArray(raw) ? raw[0] : raw) as
    | { review_count?: unknown; rating_avg?: unknown }
    | null
    | undefined;
  if (!row) return null;
  const avg = row.rating_avg == null ? NaN : Number(row.rating_avg);
  return { count: Number(row.review_count) || 0, average: avg > 0 ? avg : null };
}

/** The card and profile header show the average from three reviews on (J3); else null. */
export function shownRating(rating: LabRating | null | undefined): LabRating | null {
  return rating && rating.count >= 3 && rating.average ? rating : null;
}

/** "4.7" / "4,7": one decimal, in the reader's locale. */
export const formatAverage = (average: number, lang: string): string =>
  average.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
