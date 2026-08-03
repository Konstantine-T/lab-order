import { Box, Stack, Typography, useTheme, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
import { Icon } from '@/components/design/Icon';
import { motion, radii, tone, type Tone } from '@/theme/tokens';

const DEFAULT_ICON: Record<Tone, string> = {
  brand: 'info',
  info: 'info',
  success: 'check_circle',
  warning: 'warning',
  danger: 'error',
  neutral: 'info',
};

/**
 * The tinted advisory row the mockups use for hints, warnings and "needs your
 * attention" items: a soft fill, a matching hairline border, a leading icon and
 * one or two lines of text.
 *
 * With `onClick` it becomes an actionable row and grows a trailing chevron, as
 * on the Lab Dashboard's attention list.
 */
export function Callout({
  tone: toneName = 'brand',
  icon,
  title,
  children,
  onClick,
  action,
  sx,
}: {
  tone?: Tone;
  /** Material Symbols name; defaults to one that suits the tone. */
  icon?: string | null;
  /** Bold first line. With no children it is the whole message. */
  title?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  /** Trailing control — a button or link, instead of the chevron. */
  action?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const theme = useTheme();
  const t = tone(toneName, theme.palette.mode);
  const glyph = icon === null ? null : (icon ?? DEFAULT_ICON[toneName]);

  return (
    <Stack
      direction="row"
      alignItems={children ? 'flex-start' : 'center'}
      spacing={1.25}
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
      sx={[
        {
          px: 1.875,
          py: 1.5,
          borderRadius: `${radii.tile}px`,
          bgcolor: t.bg,
          border: 1,
          borderColor: t.border,
          ...(onClick && {
            cursor: 'pointer',
            transition: `background-color ${motion.fast}`,
            '&:hover': { filter: 'brightness(0.98)' },
          }),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {glyph && (
        <Icon name={glyph} size={18} sx={{ color: t.fg, flexShrink: 0, mt: children ? 0.125 : 0 }} />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {title && (
          <Typography sx={{ fontSize: '0.78125rem', fontWeight: 600, color: t.fg }}>
            {title}
          </Typography>
        )}
        {children && (
          <Typography
            variant="caption"
            sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.55, mt: title ? 0.25 : 0 }}
          >
            {children}
          </Typography>
        )}
      </Box>
      {action}
      {!action && onClick && (
        <Icon name="chevron_right" size={16} sx={{ color: t.fg, flexShrink: 0 }} />
      )}
    </Stack>
  );
}
