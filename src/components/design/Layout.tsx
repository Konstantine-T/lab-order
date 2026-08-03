import { Box, Stack, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
import { layout } from '@/theme/tokens';

/**
 * The two-column body the mockups give every detail and wizard screen: a fluid
 * content column and a sticky right rail that clears the page header.
 *
 * Below `lg` the rail drops under the content, since 316px plus a readable
 * content column no longer fits.
 */
export function SplitLayout({
  children,
  rail,
  /** Puts the rail above the content on narrow screens — used where the rail
   *  holds the primary action (the order wizard's submit). */
  railFirstOnMobile,
}: {
  children: ReactNode;
  rail: ReactNode;
  railFirstOnMobile?: boolean;
}) {
  return (
    <Stack
      direction={{ xs: railFirstOnMobile ? 'column-reverse' : 'column', lg: 'row' }}
      spacing={2.75}
      alignItems="flex-start"
    >
      <Stack spacing={2} sx={{ flex: 1, minWidth: 0, width: '100%' }}>
        {children}
      </Stack>

      <Stack
        spacing={1.75}
        sx={{
          width: { xs: '100%', lg: layout.railWidth },
          flexShrink: 0,
          position: { lg: 'sticky' },
          top: { lg: layout.railTop },
        }}
      >
        {rail}
      </Stack>
    </Stack>
  );
}

/** The vertical rhythm between stacked section cards. */
export function CardStack({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Stack spacing={2} sx={sx}>
      {children}
    </Stack>
  );
}

/**
 * The responsive metric grid: four across on desktop, two on tablet, one on a
 * phone — the ladder agreed in the foundation spec.
 */
export function StatGrid({
  children,
  columns = 4,
  sx,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={[
        {
          display: 'grid',
          gap: 1.75,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            md: `repeat(${columns}, minmax(0, 1fr))`,
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}

/** Two equal cards side by side, collapsing to one column below `md`. */
export function CardGrid({
  children,
  columns = 2,
  sx,
}: {
  children: ReactNode;
  columns?: 2 | 3;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={[
        {
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            md: `repeat(${columns}, minmax(0, 1fr))`,
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
