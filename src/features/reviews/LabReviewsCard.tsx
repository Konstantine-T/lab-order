import { Box, Button, Divider, Rating, Stack, Typography } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useUiLang } from '@/features/lab/labText';
import { panelSx } from '@/features/catalog/labProfile/format';
import type { PublicLabReview } from '@/types/database';
import { formatAverage, shownRating } from './rating';
import { useLabRating } from './useLabRating';
import { starSx } from './reviewDraft';
import { ReviewItem } from './ReviewItem';

const PAGE = 10;

/**
 * The reviews on a lab's public profile, below its services (0044, C2).
 *
 * Read through `lab_reviews_public()`, the only door guests have: it returns
 * stars, comment, "Irakli K.", the service, dates and the reply — never who
 * ordered what. Not rendered at all while the lab has no visible review (J4);
 * one or two are listed without an average; from three on the header shows
 * the average too. Ten at a time.
 *
 * Its own chunk: the guest profile is in the entry bundle and most visitors
 * never scroll this far.
 */
export default function LabReviewsCard({
  labId,
  labName,
}: {
  labId: string;
  labName: string;
}) {
  const { t } = useTranslation('doctor');
  const lang = useUiLang();
  const { data: rating } = useLabRating(labId);

  const { data, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['public-lab-reviews', labId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('lab_reviews_public', {
        p_lab_id: labId,
        p_limit: PAGE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return (data ?? []) as PublicLabReview[];
    },
    getNextPageParam: (last, pages) =>
      last.length === PAGE ? pages.reduce((n, p) => n + p.length, 0) : undefined,
  });

  const reviews = data?.pages.flat() ?? [];
  // Nothing while loading, on an error, or with no reviews: no empty card (J4).
  if (isError || reviews.length === 0) return null;

  const shown = shownRating(rating);

  return (
    <Box
      component="section"
      id="lab-reviews"
      aria-labelledby="lab-reviews-title"
      sx={[panelSx, { px: { xs: 2.25, sm: 3.5 }, pt: 2.75, pb: 2.25 }]}
    >
      <Typography
        id="lab-reviews-title"
        component="h2"
        tabIndex={-1}
        sx={{ fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3, outline: 'none', scrollMarginTop: 110 }}
      >
        {t('reviews.sectionTitle')}
      </Typography>

      {shown && shown.average !== null && (
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1.75, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography
            component="p"
            sx={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}
          >
            {formatAverage(shown.average, lang)}
          </Typography>
          <Stack spacing={0.25}>
            <Rating value={shown.average} precision={0.1} readOnly sx={starSx} aria-hidden />
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
              {t('reviews.count', { count: shown.count })}
            </Typography>
          </Stack>
        </Stack>
      )}

      <Stack divider={<Divider flexItem />} spacing={2} sx={{ mt: 2.25 }}>
        {reviews.map((r) => (
          <ReviewItem key={r.id} review={r} labName={labName} />
        ))}
      </Stack>

      {hasNextPage && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Button variant="outlined" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {t('reviews.showMore')}
          </Button>
        </Box>
      )}
    </Box>
  );
}
