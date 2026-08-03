import { alpha, Box, Stack, Typography, useTheme, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
import { Icon } from '@/components/design/Icon';
import { brand, radii, tone, type Tone } from '@/theme/tokens';

/**
 * The white panel every mockup builds its screens out of: a 16-radius card
 * with a header row — a brand icon *or* a numbered step bubble, a 15px title,
 * an optional completion tick or error pill, and right-aligned meta — over the
 * section's content.
 *
 * `dense` drops the body padding for cards that host their own full-bleed rows
 * (tables, lists), which the mockups render edge-to-edge inside the card.
 */
export function SectionCard({
  title,
  icon,
  step,
  meta,
  done,
  error,
  actions,
  children,
  accent,
  dense,
  sx,
}: {
  title?: ReactNode;
  /** Material Symbols name shown in brand colour before the title. */
  icon?: string;
  /** Step number bubble — the wizard's numbered sections. */
  step?: number;
  /** Muted text at the right of the header row. */
  meta?: ReactNode;
  /** Green tick after the title — section satisfied. */
  done?: boolean;
  /** Red pill after the title — e.g. "Required". */
  error?: ReactNode;
  /** Buttons at the right of the header row, after `meta`. */
  actions?: ReactNode;
  children?: ReactNode;
  /** Thicker tinted border, for cards that demand attention. */
  accent?: Tone;
  dense?: boolean;
  sx?: SxProps<Theme>;
}) {
  const theme = useTheme();
  const accentStyle = accent ? tone(accent, theme.palette.mode) : null;
  const hasHeader = Boolean(title || icon || step || meta || actions);

  return (
    <Box
      sx={[
        {
          bgcolor: 'background.paper',
          borderRadius: `${radii.card}px`,
          border: accentStyle ? 1.5 : 1,
          borderColor: accentStyle ? accentStyle.border : 'divider',
          overflow: 'hidden',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {hasHeader && (
        <Stack
          direction="row"
          alignItems="center"
          sx={{
            gap: 1.25,
            flexWrap: 'wrap',
            px: 3,
            pt: 2.75,
            pb: children ? 0 : 2.75,
          }}
        >
          {step !== undefined && (
            <Box
              sx={{
                width: 26,
                height: 26,
                flexShrink: 0,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                bgcolor: alpha(brand.main, 0.13),
                color: 'primary.dark',
                fontSize: '0.78125rem',
                fontWeight: 700,
              }}
            >
              {step}
            </Box>
          )}
          {icon && (
            <Icon
              name={icon}
              size={20}
              sx={{ color: accentStyle ? accentStyle.fg : 'primary.dark', flexShrink: 0 }}
            />
          )}
          {title && (
            <Typography
              component="h2"
              sx={{ fontSize: '0.96875rem', fontWeight: 700, letterSpacing: '-0.01em' }}
            >
              {title}
            </Typography>
          )}
          {done && (
            <Icon name="check_circle" size={17} filled sx={{ color: 'success.main' }} />
          )}
          {error && (
            <Box
              component="span"
              sx={{
                fontSize: '0.625rem',
                fontWeight: 700,
                px: 1.125,
                py: 0.375,
                borderRadius: `${radii.pill}px`,
                color: tone('danger', theme.palette.mode).fg,
                bgcolor: tone('danger', theme.palette.mode).bg,
              }}
            >
              {error}
            </Box>
          )}
          {(meta || actions) && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ ml: 'auto', flexShrink: 0 }}
            >
              {meta && (
                <Typography variant="caption" color="text.secondary">
                  {meta}
                </Typography>
              )}
              {actions}
            </Stack>
          )}
        </Stack>
      )}

      {children && (
        <Box sx={dense ? { mt: hasHeader ? 2 : 0 } : { px: 3, pt: hasHeader ? 1.75 : 2.5, pb: 2.75 }}>
          {children}
        </Box>
      )}
    </Box>
  );
}
