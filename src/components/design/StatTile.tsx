import { Box, Stack, Typography, useTheme } from '@mui/material';
import type { ReactNode } from 'react';
import { Icon } from '@/components/design/Icon';
import { motion, radii, tone, type Tone } from '@/theme/tokens';

/**
 * The compact metric from the Lab Orders Queue: a tinted icon square, a 20px
 * count and a caption. Sibling of `StatCard`, which is the taller dashboard
 * variant with a dotted label.
 */
export function StatTile({
  icon,
  value,
  label,
  tone: toneName = 'brand',
  onClick,
}: {
  icon: string;
  value: ReactNode;
  label: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}) {
  const theme = useTheme();
  const t = tone(toneName, theme.palette.mode);

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.625}
      {...(onClick ? { role: 'button', tabIndex: 0, onClick } : {})}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        px: 2.25,
        py: 2,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: '14px',
        ...(onClick && {
          cursor: 'pointer',
          transition: `border-color ${motion.base}`,
          '&:hover': { borderColor: 'primary.main' },
        }),
      }}
    >
      <Box
        sx={{
          width: 38,
          height: 38,
          flexShrink: 0,
          borderRadius: `${radii.tile}px`,
          bgcolor: t.bg,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name={icon} size={20} sx={{ color: t.fg }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
          {value}
        </Typography>
        <Typography
          sx={{ fontSize: '0.71875rem', fontWeight: 500, color: 'text.secondary' }}
          noWrap
        >
          {label}
        </Typography>
      </Box>
    </Stack>
  );
}
