import { Box, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * One line of the read-only answer list the mockups draw on both order detail
 * screens: a fixed-width muted label and a 13px value that wraps freely.
 */
export function DetailRow({
  label,
  children,
  labelWidth = 170,
}: {
  label: ReactNode;
  children: ReactNode;
  labelWidth?: number;
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={{ xs: 0.25, sm: 1.75 }}
      alignItems={{ sm: 'baseline' }}
    >
      <Typography
        sx={{
          width: { sm: labelWidth },
          flexShrink: 0,
          fontSize: '0.78125rem',
          color: 'text.secondary',
        }}
      >
        {label}
      </Typography>
      <Box sx={{ minWidth: 0, fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.55 }}>
        {children}
      </Box>
    </Stack>
  );
}

/** The vertical stack `DetailRow`s live in. */
export function DetailList({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Stack spacing={1.375} sx={sx}>
      {children}
    </Stack>
  );
}

/**
 * The uppercase micro-label over a value — the order sheet's summary grid and
 * the mockups' section captions.
 */
export function FieldLabel({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography
      sx={[
        {
          fontSize: '0.65625rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'text.secondary',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  );
}

/**
 * A labelled fact: uppercase caption, bold value, optional muted third line.
 * Six of these form the order sheet's header grid.
 */
export function FactCell({
  label,
  value,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <Typography sx={{ fontSize: '0.84375rem', fontWeight: 700, mt: 0.375 }}>{value}</Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

/**
 * A money line: description on the left, amount on the right. `total` draws the
 * dashed rule above it and prints the amount large and brand-coloured, as in
 * every price panel in the mockups.
 */
export function MoneyRow({
  label,
  amount,
  total,
  strong,
  color,
}: {
  label: ReactNode;
  amount: ReactNode;
  total?: boolean;
  strong?: boolean;
  color?: string;
}) {
  return (
    <Stack
      direction="row"
      alignItems="baseline"
      spacing={1}
      sx={
        total
          ? {
              borderTop: '1px dashed',
              borderColor: 'divider',
              pt: 1.125,
              mt: 0.375,
            }
          : undefined
      }
    >
      <Typography
        sx={{
          fontSize: total ? '0.84375rem' : '0.78125rem',
          fontWeight: total || strong ? 700 : 400,
          color: total || strong ? 'text.primary' : 'text.secondary',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          ml: 'auto',
          fontSize: total ? '1.0625rem' : '0.78125rem',
          fontWeight: 700,
          letterSpacing: total ? '-0.01em' : undefined,
          color: color ?? (total ? 'primary.dark' : 'text.primary'),
        }}
      >
        {amount}
      </Typography>
    </Stack>
  );
}
