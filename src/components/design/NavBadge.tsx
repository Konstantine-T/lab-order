import { Box, useTheme } from '@mui/material';
import { tone as toneOf } from '@/theme/tokens';
import { Icon } from './Icon';

/**
 * The count on a nav row — how many things in that section are waiting on
 * you right now.
 *
 * Solid rather than the tinted `StatusPill`: this has to catch the eye from
 * across the sidebar, where a status pill is meant to sit quietly inside a
 * page. Renders nothing at zero, so a row is never decorated with "0".
 *
 * Red by default. `tone="warning"` (with an `icon`) is a second, different
 * kind of count on the same row — the clinic's orders sent to it, to mark
 * received — so the two never read as one number.
 */
export function NavBadge({
  count,
  label,
  tone = 'danger',
  icon,
}: {
  count: number;
  label?: string;
  tone?: 'danger' | 'warning';
  icon?: string;
}) {
  const theme = useTheme();
  if (!count) return null;
  const warning = tone === 'warning';

  return (
    <Box
      component="span"
      aria-label={label}
      title={label}
      sx={{
        ml: 1,
        px: 0.75,
        minWidth: 20,
        height: 20,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.25,
        borderRadius: '999px',
        fontSize: '0.6875rem',
        fontWeight: 800,
        lineHeight: 1,
        color: warning ? 'warning.contrastText' : '#fff',
        bgcolor: warning ? 'warning.main' : toneOf('danger', theme.palette.mode).dot,
      }}
    >
      {icon && <Icon name={icon} size={12} />}
      {count > 99 ? '99+' : count}
    </Box>
  );
}
