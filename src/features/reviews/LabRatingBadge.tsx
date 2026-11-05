import { lazy, Suspense } from 'react';

// The badge and its helpers are their own chunk (0044): the landing page is in
// the entry bundle, and the rating is decoration. A failed load shows nothing.
const RatingBadge = lazy(() => import('./RatingBadge').catch(() => ({ default: () => null })));

/** "★ 4.7 (12)" from three reviews on; see `RatingBadge`. */
export function LabRatingBadge(props: { summary?: unknown }) {
  return (
    <Suspense fallback={null}>
      <RatingBadge {...props} />
    </Suspense>
  );
}
