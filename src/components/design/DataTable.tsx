import { alpha, Box, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
import { brand, motion, radii, surfaces } from '@/theme/tokens';

export type Column = {
  key: string;
  label?: ReactNode;
  /** CSS grid track for this column, e.g. `86px` or `1.25fr`. */
  width: string;
  align?: 'left' | 'right' | 'center';
};

/**
 * The dense list from the Lab Orders Queue: one card with a tinted uppercase
 * header row and grid rows that highlight on hover.
 *
 * A grid — not a `<table>` — because that is what the mockups draw and what
 * keeps each row a single click target. Below `md` the whole thing scrolls
 * sideways inside its card rather than forcing the page to, per the foundation
 * spec's responsive rules.
 */
export function DataTable({
  columns,
  children,
  footer,
  minWidth = 880,
  sx,
}: {
  columns: Column[];
  children: ReactNode;
  footer?: ReactNode;
  minWidth?: number;
  sx?: SxProps<Theme>;
}) {
  const template = columns.map((c) => c.width).join(' ');

  return (
    <Box
      sx={[
        {
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: `${radii.card}px`,
          overflow: 'hidden',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ minWidth }}>
          <Box
            sx={(theme) => ({
              display: 'grid',
              gridTemplateColumns: template,
              gap: 1.5,
              alignItems: 'center',
              px: 2.25,
              py: 1.375,
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor:
                theme.palette.mode === 'light' ? surfaces.light.subtle : surfaces.dark.subtle,
            })}
          >
            {columns.map((c) => (
              <Typography
                key={c.key}
                sx={{
                  fontSize: '0.65625rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                  textAlign: c.align ?? 'left',
                }}
              >
                {c.label}
              </Typography>
            ))}
          </Box>
          {children}
        </Box>
      </Box>

      {footer && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ px: 2.25, py: 1.5, borderTop: 1, borderColor: 'divider' }}
        >
          {footer}
        </Stack>
      )}
    </Box>
  );
}

/** One clickable row inside a `DataTable`. */
export function DataRow({
  columns,
  children,
  onClick,
  highlight,
}: {
  columns: Column[];
  children: ReactNode;
  onClick?: () => void;
  /** Tints the row — an unreviewed edit in the lab queue. */
  highlight?: boolean;
}) {
  return (
    <Box
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
        display: 'grid',
        gridTemplateColumns: columns.map((c) => c.width).join(' '),
        gap: 1.5,
        alignItems: 'center',
        px: 2.25,
        py: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
        bgcolor: highlight ? alpha(brand.main, 0.045) : 'transparent',
        ...(onClick && {
          cursor: 'pointer',
          transition: `background-color ${motion.fast}`,
          '&:hover': { bgcolor: alpha(brand.main, 0.05) },
          '&:focus-visible': { outline: 'none', bgcolor: alpha(brand.main, 0.09) },
        }),
      }}
    >
      {children}
    </Box>
  );
}

/**
 * The mockups' pager: square page buttons, the current one filled brand.
 * Rendered in a `DataTable` footer or under a card list.
 */
export function Pager({
  page,
  pageCount,
  onChange,
}: {
  /** Zero-based. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const pages = Array.from({ length: pageCount }, (_, i) => i).filter(
    (i) => i === 0 || i === pageCount - 1 || Math.abs(i - page) <= 1,
  );

  const box = {
    width: 28,
    height: 28,
    minWidth: 28,
    p: 0,
    borderRadius: '8px',
    display: 'grid',
    placeItems: 'center',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: 1,
    borderColor: 'divider',
    bgcolor: 'background.paper',
    color: 'text.secondary',
    transition: `all ${motion.fast}`,
    '&:hover:not(:disabled)': { borderColor: 'primary.main', color: 'text.primary' },
    '&:disabled': { opacity: 0.4, cursor: 'default' },
  } as const;

  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box component="button" type="button" disabled={page === 0} onClick={() => onChange(page - 1)} sx={box}>
        ‹
      </Box>
      {pages.map((i, idx) => (
        <Stack key={i} direction="row" spacing={0.75} alignItems="center">
          {idx > 0 && pages[idx - 1] !== i - 1 && (
            <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>…</Typography>
          )}
          <Box
            component="button"
            type="button"
            onClick={() => onChange(i)}
            sx={[
              box,
              i === page && {
                bgcolor: 'primary.main',
                borderColor: 'primary.main',
                color: 'primary.contrastText',
                fontWeight: 700,
              },
            ]}
          >
            {i + 1}
          </Box>
        </Stack>
      ))}
      <Box
        component="button"
        type="button"
        disabled={page >= pageCount - 1}
        onClick={() => onChange(page + 1)}
        sx={box}
      >
        ›
      </Box>
    </Stack>
  );
}
