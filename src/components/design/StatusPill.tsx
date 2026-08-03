import type { ReactNode } from 'react';
import { Box, useTheme, type SxProps, type Theme } from '@mui/material';
import { radii, tone, type Tone } from '@/theme/tokens';

/**
 * The tinted 999-radius pill the mockups use for every status: order status,
 * payment status, lab approval, connection state.
 *
 * Colours come from the shared tone table so a pill can never invent its own
 * tint. `OrderStatusChip` / `LabStatusChip` map their domain enums onto a tone
 * and render this.
 */
export function StatusPill({
  tone: toneName = 'neutral',
  children,
  dot = false,
  sx,
}: {
  tone?: Tone;
  children: ReactNode;
  /** Leading status dot, as on the dashboard stat labels. */
  dot?: boolean;
  sx?: SxProps<Theme>;
}) {
  const theme = useTheme();
  const t = tone(toneName, theme.palette.mode);

  return (
    <Box
      component="span"
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          borderRadius: `${radii.pill}px`,
          px: 1.375,
          py: 0.5,
          fontSize: '0.6875rem',
          fontWeight: 700,
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          color: t.fg,
          bgcolor: t.bg,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {dot && (
        <Box
          component="span"
          sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor', flexShrink: 0 }}
        />
      )}
      {children}
    </Box>
  );
}
