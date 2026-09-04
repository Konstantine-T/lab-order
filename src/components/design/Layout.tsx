import { Box, Stack, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
import { layout } from '@/theme/tokens';

/**
 * The two-column body the mockups give every detail and wizard screen: a fluid
 * content column and a sticky right rail that clears the page header.
 *
 * Below `lg` the rail drops under the content, since 316px plus a readable
 * content column no longer fits.
 *
 * The rail is capped to the viewport and scrolls itself. Sticky positioning
 * pins an element in place; if that element is taller than the screen, the part
 * below the fold simply cannot be reached, because scrolling the page is
 * exactly what sticky prevents. The lab order sheet stacks enough cards to hit
 * this, and the order team section at the bottom became unreachable. The cap is
 * load-bearing, not decoration — don't remove it as unused styling.
 *
 * The cap is `lg`-only: below that the rail is a normal block in the page flow,
 * and an inner scroll container on a phone would be a trap.
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
        sx={(theme) => ({
          width: { xs: '100%', lg: layout.railWidth },
          flexShrink: 0,
          position: { lg: 'sticky' },
          top: { lg: layout.railTop },
          // Clears the header, then leaves a little air so the last card doesn't
          // sit flush against the bottom of the window.
          maxHeight: { lg: `calc(100vh - ${layout.railTop}px - 24px)` },
          // `auto`, not `scroll`: a short rail shows no gutter and passes its
          // scroll straight to the page.
          overflowY: { xs: 'visible', lg: 'auto' },
          overscrollBehavior: { lg: 'contain' },
          // A scroll container clips at its edges, and the rail's cards lift on
          // hover. Pad the scroll box so the shadow and focus ring have room,
          // then pull the same amount back off the margin so the column keeps
          // its width.
          pr: { lg: 0.5 },
          mr: { lg: -0.5 },
          // The platform scrollbar is heavy against a card-lined rail; this one
          // takes its colours from the palette so it reads in both themes.
          scrollbarWidth: 'thin',
          scrollbarColor: `${theme.palette.divider} transparent`,
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: theme.palette.divider,
            borderRadius: 3,
          },
          '&:hover::-webkit-scrollbar-thumb': {
            backgroundColor: theme.palette.text.disabled,
          },
        })}
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
          // Every row as tall as the tallest card, not just every card in a
          // row as tall as its own neighbours. Without it a two-line
          // description on one service made that whole row taller than the
          // next, and the grid read as ragged rather than as a set.
          //
          // Only where there is more than one column: at `xs` every row holds
          // a single card, so equalising rows would stretch a short card to
          // the height of the tallest one in the whole list.
          gridAutoRows: { xs: 'auto', md: '1fr' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
