import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design/Icon';
import { useUiLang } from '@/features/lab/labText';
import { palette2026 } from '@/theme/tokens';
import { formatAverage, ratingOf, shownRating } from './rating';

/**
 * "★ 4.7 (12)": a lab's public average on the landing card, from three visible
 * reviews on (J3); below that, nothing at all. Loaded lazily through
 * `LabRatingBadge` so none of it weighs on the entry chunk.
 *
 * `summary` is the card's `lab_rating_summary` embed.
 */
export default function RatingBadge({ summary }: { summary?: unknown }) {
  const { t } = useTranslation('doctor');
  const lang = useUiLang();
  const rating = shownRating(ratingOf(summary));
  if (!rating) return null;
  const average = formatAverage(rating.average ?? 0, lang);

  return (
    <Box
      component="span"
      role="img"
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
