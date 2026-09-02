import { Box, useTheme } from '@mui/material';
import { tone } from '@/theme/tokens';

/**
 * The red count on a sidebar row — how many things in that section are waiting
 * on you right now.
 *
 * Solid rather than the tinted `StatusPill`: this has to catch the eye from
 * across the sidebar, where a status pill is meant to sit quietly inside a
 * page. Renders nothing at zero, so a row is never decorated with "0".
 */
export function NavBadge({ count, label }: { count: number; label?: string }) {
  const theme = useTheme();
  if (!count) return null;

  return (
    <Box
      component="span"
      aria-label={label}
      sx={{
        ml: 1,
        px: 0.75,
        minWidth: 20,
        height: 20,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '999px',
        fontSize: '0.6875rem',
        fontWeight: 800,
        lineHeight: 1,
        color: '#fff',
        bgcolor: tone('danger', theme.palette.mode).dot,
      }}
    >
      {count > 99 ? '99+' : count}
    </Box>
  );
}
