import { Box, Stack, useMediaQuery, useTheme, type SxProps, type Theme } from '@mui/material';
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { layout } from '@/theme/tokens';

/**
 * The two-column body the mockups give every detail and wizard screen: a fluid
 * content column and a right rail that clears the page header.
 *
 * Below `lg` the rail drops under the content, since 316px plus a readable
 * content column no longer fits.
 *
 * THE RAIL PINS ONLY WHEN IT FITS. Sticky positioning pins an element in place,
 * so an element taller than the screen has a bottom that can never be reached —
 * scrolling the page is precisely what sticky prevents. Capping the rail and
 * giving it its own scrollbar does make everything reachable, but it buys that
 * with a scroll inside a scroll: on the lab order sheet that is 1295px of
 * controls inside a 622px box, and the sections below the fold read as missing.
 *
 * So the rail measures itself. Short enough to sit in the viewport — which is
 * most screens — and it pins, which is the whole point of a rail. Taller, and
 * it becomes an ordinary column that scrolls with the page: nothing pinned,
 * nothing clipped, one scrollbar. CSS cannot express "sticky only if you fit",
 * which is why this is measured rather than declared.
 */
/** Air below a pinned rail so it never sits flush against the window edge. */
const RAIL_GUTTER = 24;

/** Usable height for a pinned rail: window, less the header band it clears,
 *  less that gutter. */
const railSpace = () => window.innerHeight - layout.railTop - RAIL_GUTTER;

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
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up('lg'));
  const railRef = useRef<HTMLDivElement | null>(null);
  const [fits, setFits] = useState(true);

  // Room between the rail's top and the bottom of the window, with a little air
  // so a pinned rail doesn't sit flush against the edge.
  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setFits(el.scrollHeight <= railSpace());
  }, []);

  useLayoutEffect(() => {
    if (!isWide) return;
    measure();
    // The rail's height changes as cards load, expand, or gain an error — and
    // the window's changes when it is resized. Both flip the answer.
    const ro = new ResizeObserver(measure);
    if (railRef.current) ro.observe(railRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isWide, measure]);

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
        ref={railRef}
        spacing={1.75}
        sx={{
          width: { xs: '100%', lg: layout.railWidth },
          flexShrink: 0,
          ...(isWide
            ? {
                position: 'sticky',
                top: layout.railTop,
                // Short rail: nothing to scroll, and a max-height would only
                // invite a scrollbar over a few pixels of rounding.
                // Tall rail: it scrolls itself rather than scrolling away with
                // the page. The rail holds the primary action — the wizard's
                // submit — and a rail taller than the window used to carry that
                // button off the bottom, so reaching it meant scrolling the
                // whole form past.
                ...(fits
                  ? {}
                  : { maxHeight: `calc(100vh - ${layout.railTop + RAIL_GUTTER}px)`, overflowY: 'auto' }),
              }
            : { position: 'static' }),
          // Cards keep their natural height. In a column flex container they
          // would otherwise inherit `flex-shrink: 1` and be compressed to fit,
          // each one clipping its own contents rather than the column growing.
          // Still required with the scroll: without it the children shrink to
          // the capped height instead of overflowing it, which is the bug that
          // made the rail look like it had no content rather than a scrollbar.
          '& > *': { flexShrink: 0 },
          // Only when it actually scrolls, so a short rail keeps the page's
          // own gutter rhythm.
          ...(isWide && !fits ? { pr: 0.75 } : {}),
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
