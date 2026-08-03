import { alpha, Box, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
import { brand, motion, radii } from '@/theme/tokens';

/**
 * The selectable pill the mockups use everywhere a small set of options is
 * shown inline: list filters, wizard answers, the lab's status switcher.
 *
 * Selected is a solid brand fill with white text; unselected is the white
 * button treatment with a hairline border.
 */
export function ChoicePill({
  selected,
  onClick,
  children,
  count,
  disabled,
  /** `md` is the wizard's answer pill; `sm` the tighter list filter. */
  size = 'sm',
  swatch,
  sx,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  /** Trailing count, dimmed — the list filters' item counts. */
  count?: number | string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Colour dot before the label — materials, shades. */
  swatch?: string;
  sx?: SxProps<Theme>;
}) {
  const md = size === 'md';

  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.875,
          px: md ? 2.25 : 1.875,
          py: md ? 1 : 0.875,
          borderRadius: `${radii.pill}px`,
          border: 1,
          fontFamily: 'inherit',
          fontSize: md ? '0.84375rem' : '0.78125rem',
          fontWeight: 600,
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: `all ${motion.fast}`,
          borderColor: selected ? 'primary.main' : 'divider',
          bgcolor: selected ? 'primary.main' : 'background.paper',
          color: selected ? 'primary.contrastText' : 'text.primary',
          '&:hover': disabled
            ? {}
            : {
                borderColor: 'primary.main',
                bgcolor: selected ? 'primary.dark' : alpha(brand.main, 0.06),
              },
          '&:focus-visible': {
            outline: 'none',
            boxShadow: `0 0 0 3px ${alpha(brand.main, 0.28)}`,
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {swatch && (
        <Box
          component="span"
          sx={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            bgcolor: swatch,
            border: '1px solid rgba(0,0,0,0.15)',
            flexShrink: 0,
          }}
        />
      )}
      {children}
      {count !== undefined && (
        <Box component="span" sx={{ fontSize: '0.6875rem', fontWeight: 700, opacity: 0.65 }}>
          {count}
        </Box>
      )}
    </Box>
  );
}

/** A wrapping row of `ChoicePill`s — the filter bar above every list. */
export function PillRow({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Stack
      direction="row"
      sx={[{ flexWrap: 'wrap', gap: 0.75 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Stack>
  );
}

/**
 * The iOS-style segmented control from the wizard's "Invoice recipient": a
 * sunken track with one raised white option.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  sx,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  sx?: SxProps<Theme>;
}) {
  return (
    <Stack
      direction="row"
      spacing={0.375}
      sx={[
        {
          p: 0.375,
          borderRadius: `${radii.control}px`,
          bgcolor: 'background.default',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Box
            key={o.value}
            component="button"
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={selected}
            sx={{
              flex: 1,
              border: 0,
              py: 0.875,
              borderRadius: '8px',
              fontFamily: 'inherit',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: `all ${motion.base}`,
              bgcolor: selected ? 'background.paper' : 'transparent',
              color: selected ? 'text.primary' : 'text.secondary',
              boxShadow: selected ? '0 1px 3px rgba(15,23,42,0.12)' : 'none',
            }}
          >
            {o.label}
          </Box>
        );
      })}
    </Stack>
  );
}

/**
 * The small grey capsule the mockups use for read-only facts on a card —
 * turnaround, pricing model, a material and its teeth.
 */
export function MetaChip({
  icon,
  swatch,
  children,
  color,
  bgcolor,
  sx,
}: {
  icon?: ReactNode;
  swatch?: string;
  children: ReactNode;
  color?: string;
  bgcolor?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.625}
      component="span"
      sx={[
        {
          display: 'inline-flex',
          px: 1.375,
          py: 0.5,
          borderRadius: `${radii.pill}px`,
          bgcolor: bgcolor ?? 'background.default',
          color: color ?? 'text.primary',
          fontSize: '0.6875rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {swatch && (
        <Box
          component="span"
          sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: swatch, flexShrink: 0 }}
        />
      )}
      {icon}
      <Typography component="span" sx={{ fontSize: 'inherit', fontWeight: 'inherit' }}>
        {children}
      </Typography>
    </Stack>
  );
}
