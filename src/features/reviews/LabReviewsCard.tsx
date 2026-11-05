import { Box, Link, Rating, Stack, Typography, useTheme } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design/Icon';
import { supabase } from '@/lib/supabase';
import { pickText, useUiLang } from '@/features/lab/labText';
import { panelSx, SECTION, sectionScrollMargin } from '@/features/catalog/labProfile/format';
import { shortDate } from '@/features/orders/detail/format';
import { DARK, initialsOf, palette2026, radii, surfaces, tone } from '@/theme/tokens';
import type { PublicLabReview } from '@/types/database';
import { formatAverage, shownRating } from './rating';
import { useLabRating } from './useLabRating';
import { starSx } from './reviewDraft';

const PAGE = 10;

/** Below this card width a review drops its avatar. */
const NARROW = '@container (max-width: 640px)';

/**
 * One review as the mockup draws it on the profile: initials, name and stars,
 * the service and date, the comment, the lab's reply on a tint, and that it came
 * from a real order. Every review does: `save_lab_review` takes only a completed
 * order. The mockup's order code, city, specialty and "helpful" count are left
 * out: the public RPC deliberately returns who ordered what to no one.
 *
 * The lab's and the admin's pages keep their own `ReviewItem`.
 */
function ProfileReview({ review, labName }: { review: PublicLabReview; labName: string }) {
  const { t } = useTranslation('doctor');
  const lang = useUiLang();
  const theme = useTheme();
  const mode = theme.palette.mode;
  const accent = mode === 'light' ? palette2026.periText : DARK.periLight;
  const success = tone('success', mode);
  const service = pickText(review.service_name, review.service_translations, 'name', lang).trim();
  const reviewer = review.reviewer_display.trim() || t('reviews.anonymous');
  const meta = [service, shortDate(review.created_at), review.edited && t('reviews.edited')]
    .filter(Boolean)
    .join(' · ');
  const textSx = { whiteSpace: 'pre-line', overflowWrap: 'anywhere' } as const;

  return (
    <Box
      component="article"
      sx={{
        display: 'grid',
        gridTemplateColumns: '44px minmax(0, 1fr)',
        gap: 1.75,
        py: 2.5,
        borderTop: 1,
        borderColor: 'divider',
        [NARROW]: { gridTemplateColumns: 'minmax(0, 1fr)' },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 40,
          height: 40,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          bgcolor: success.bg,
          color: success.fg,
          fontSize: '0.8125rem',
          fontWeight: 700,
          [NARROW]: { display: 'none' },
        }}
      >
        {initialsOf(reviewer)}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', columnGap: 1.25, rowGap: 0.25 }}>
          <Typography sx={{ fontSize: '0.90625rem', fontWeight: 700, overflowWrap: 'anywhere' }}>
            {reviewer}
          </Typography>
          <Rating
            value={review.rating}
            readOnly
            size="small"
            sx={[starSx, { ml: 'auto' }]}
            getLabelText={(v: number) => t('reviews.starLabel', { count: v })}
          />
        </Stack>
        <Typography
          sx={{ mt: '2px', fontSize: '0.78125rem', color: 'text.secondary', overflowWrap: 'anywhere' }}
        >
          {meta}
        </Typography>

        {review.comment && (
          <Typography sx={{ ...textSx, mt: 1, fontSize: '0.90625rem', lineHeight: 1.6 }}>
            {review.comment}
          </Typography>
        )}

        {review.lab_reply && (
          <Box
            sx={{
              mt: 1.5,
              px: 1.75,
              py: 1.25,
              borderRadius: `${radii.tile}px`,
              bgcolor: surfaces[mode].chip,
              fontSize: '0.84375rem',
              lineHeight: 1.5,
            }}
          >
            <Box component="b" sx={{ fontWeight: 700, color: accent, overflowWrap: 'anywhere' }}>
              {t('reviews.replyFrom', { lab: labName })}
            </Box>
            {review.lab_replied_at && (
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {` · ${shortDate(review.lab_replied_at)}`}
              </Box>
            )}
            <Box sx={textSx}>{review.lab_reply}</Box>
          </Box>
        )}

        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{ mt: 1.25, fontSize: '0.78125rem', color: 'text.secondary' }}
        >
          <span>{t('reviews.verifiedOrder')}</span>
          <Icon name="check" size={14} sx={{ color: success.dot }} />
        </Stack>
      </Box>
    </Box>
  );
}

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
  const { palette } = useTheme();
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
      id={SECTION.reviews}
      aria-labelledby="lab-reviews-title"
      sx={[
        panelSx,
        {
          containerType: 'inline-size',
          p: { xs: 2, sm: 3 },
          pb: { xs: 1.5, sm: 2 },
          scrollMarginTop: sectionScrollMargin,
        },
      ]}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5 }}>
        <Typography
          id="lab-reviews-title"
          component="h2"
          tabIndex={-1}
          sx={{ fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, outline: 'none' }}
        >
          {t('reviews.sectionTitle')}
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', flex: '1 1 260px' }}>
          {t('reviews.onlyDelivered')}
        </Typography>
      </Box>

      {shown && shown.average !== null && (
        <Stack spacing={0.75} sx={{ pt: 2.25, pb: 2.75 }}>
          <Typography
            component="p"
            sx={{ fontSize: '3.375rem', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}
          >
            {formatAverage(shown.average, lang)}
            <Box
              component="small"
              sx={{ ml: '3px', fontSize: '1.125rem', fontWeight: 600, letterSpacing: 0, color: 'text.secondary' }}
            >
              /5
            </Box>
          </Typography>
          <Rating value={shown.average} precision={0.1} readOnly sx={starSx} aria-hidden />
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
            {t('reviews.count', { count: shown.count })}
          </Typography>
        </Stack>
      )}

      <Box sx={{ mt: shown ? 0 : 2 }}>
        {reviews.map((r) => (
          <ProfileReview key={r.id} review={r} labName={labName} />
        ))}
      </Box>

      {hasNextPage && (
        <Box sx={{ pt: 1.75, pb: 1, borderTop: 1, borderColor: 'divider' }}>
          <Link
            component="button"
            type="button"
            underline="hover"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
            sx={{
              fontSize: '0.875rem',
              fontWeight: 700,
              color: palette.mode === 'light' ? palette2026.periText : DARK.periLight,
            }}
          >
            {t('reviews.showMore')}
          </Link>
        </Box>
      )}
    </Box>
  );
}
