import { Link, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { DARK, palette2026 } from '@/theme/tokens';

/**
 * "3 cancelled orders hidden · Show", under an orders list and in its empty
 * state. With no status selected the lists leave cancelled orders out
 * (statusSelection); this says how many of them the other filters would have
 * shown, and "Show" selects "Cancelled". Renders nothing when none are hidden.
 */
export function CancelledHiddenHint({ count, onShow }: { count: number; onShow: () => void }) {
  const { t } = useTranslation('common');
  const mode = useTheme().palette.mode;
  if (count === 0) return null;
  return (
    <Typography
      sx={{ fontSize: '0.8125rem', color: 'text.secondary', textAlign: 'center', lineHeight: 1.5 }}
    >
      {t('orderList.cancelledHidden', { count })}
      {' · '}
      <Link
        component="button"
        type="button"
        underline="hover"
        onClick={onShow}
        sx={{
          fontSize: 'inherit',
          fontWeight: 700,
          verticalAlign: 'baseline',
          color: mode === 'light' ? palette2026.periText : DARK.periLight,
        }}
      >
        {t('orderList.showCancelled')}
      </Link>
    </Typography>
  );
}
