import type { MouseEvent } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design/Icon';
import { useUiLang } from '@/features/lab/labText';
import { palette2026 } from '@/theme/tokens';
import { formatAverage, ratingOf, shownRating } from './rating';
import { useLabRating } from './useLabRating';

/**
 * "★ 4.7 (12)": a lab's public average, on the catalogue card, the landing
 * card and the profile header, from three visible reviews on (J3); below
 * that, nothing at all. Loaded lazily through `LabRatingBadge` so none of it
 * weighs on the entry chunk.
 *
 * `summary` is the card's `lab_rating_summary` embed; with `labId` instead it
 * reads the summary itself (the profile header) and, with `link`, is a link
 * that jumps to the reviews card.
 */
export default function RatingBadge({
  summary,
  labId,
  link,
}: {
  summary?: unknown;
  labId?: string;
  link?: boolean;
}) {
  const { t } = useTranslation('doctor');
  const lang = useUiLang();
  const { data } = useLabRating(labId);
  const rating = shownRating(labId ? data : ratingOf(summary));
  if (!rating) return null;
  const average = formatAverage(rating.average ?? 0, lang);

  return (
    <Box
      component={link ? 'a' : 'span'}
      href={link ? '#lab-reviews' : undefined}
      onClick={
        link
          ? (e: MouseEvent) => {
              // React Router never scrolls to a hash: jump to the (lazy)
              // reviews card and focus its heading.
              const h = document.getElementById('lab-reviews-title');
              if (!h) return;
              e.preventDefault();
              h.scrollIntoView();
              h.focus({ preventScroll: true });
            }
          : undefined
      }
      role={link ? undefined : 'img'}
      aria-label={t('reviews.ratedA11y', { average, count: rating.count })}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.375,
        flexShrink: 0,
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: 'text.primary',
        whiteSpace: 'nowrap',
        textDecoration: 'none',
        // The header's link sits in a column: keep it to its own width.
        ...(link && { alignSelf: 'flex-start', '&:hover > :last-child': { textDecoration: 'underline' } }),
      }}
    >
      <Icon name="star" size={16} filled color={palette2026.gold} />
      <span aria-hidden>{average}</span>
      <Box component="span" aria-hidden sx={{ color: 'text.secondary', fontWeight: 500 }}>
        ({rating.count})
      </Box>
    </Box>
  );
}
