import { alpha, Box, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design/Icon';
import { DARK, palette2026, surfaces, tone } from '@/theme/tokens';

/*
 * The pieces the catalogue's lab card and the lab's profile share, both drawn
 * from the same mockups (labs.html, lab.html).
 */

/** The pulsing green dot of a lab taking orders. */
export function LiveDot() {
  return (
    <Box
      component="i"
      sx={{
        width: 9,
        height: 9,
        flexShrink: 0,
        borderRadius: '50%',
        bgcolor: palette2026.live,
        boxShadow: `0 0 0 3px ${alpha(palette2026.live, 0.2)}`,
        animation: 'lab-live 2s infinite',
        '@keyframes lab-live': { '50%': { boxShadow: '0 0 0 7px transparent' } },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    />
  );
}

/**
 * The check beside a lab's name. Only approved, live labs are ever listed or
 * have a profile, so every lab that shows it has passed the platform's review.
 * Raised, so its tooltip shows above a card's stretched link.
 */
export function VerifiedMark() {
  const { t } = useTranslation('doctor');
  const { palette } = useTheme();
  const label = t('marketplace.card.verified');
  return (
    <Box
      component="span"
      role="img"
      aria-label={label}
      title={label}
      sx={{
        position: 'relative',
        zIndex: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        flexShrink: 0,
        borderRadius: '50%',
        bgcolor: tone('success', palette.mode).dot,
        color: palette.mode === 'light' ? 'common.white' : DARK.onPrimary,
      }}
    >
      <Icon name="check" size={14} />
    </Box>
  );
}

/** Five stars, filled to `value` out of 5; decorative beside the number they show. */
export function StarRow({ value, size = 15 }: { value: number; size?: number }) {
  const { palette } = useTheme();
  const row = (color: string) => (
    <Box sx={{ display: 'flex', width: size * 5 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon key={i} name="star" size={size} filled color={color} />
      ))}
    </Box>
  );
  return (
    <Box component="span" aria-hidden sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      {row(surfaces[palette.mode].control)}
      <Box sx={{ position: 'absolute', top: 0, left: 0, width: `${(value / 5) * 100}%`, overflow: 'hidden' }}>
        {row(palette2026.gold)}
      </Box>
    </Box>
  );
}
