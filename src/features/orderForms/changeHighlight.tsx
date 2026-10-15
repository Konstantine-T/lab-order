import type { ReactNode } from 'react';
import { alpha, Box, useTheme, type SxProps, type Theme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { StatusPill } from '@/components/design';
import { layout, radii, tone } from '@/theme/tokens';

/**
 * The cue a changed section gets: a bar down its left edge and a faint wash in
 * the warning colour. The section's content keeps its alignment; the bar sits
 * in the gutter of the card around it.
 *
 * Focusable from script only, so a "what changed" chip can move focus here.
 */
export function ChangedFrame({
  markId,
  labelledBy,
  ariaLabel,
  children,
  sx,
}: {
  markId: string;
  /** Ids of the heading and pill that name this section for a screen reader. */
  labelledBy?: string;
  ariaLabel?: string;
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const warn = tone('warning', mode);
  return (
    <Box
      component="section"
      data-changed-section={markId}
      tabIndex={-1}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : ariaLabel}
      sx={[
        {
          borderLeft: '3px solid',
          borderLeftColor: warn.dot,
          bgcolor: alpha(warn.dot, mode === 'dark' ? 0.09 : 0.07),
          borderRadius: `0 ${radii.chipSm}px ${radii.chipSm}px 0`,
          mx: -1.5,
          px: 1.5,
          py: 1.5,
          // A chip's scroll lands here; keep it clear of the sticky chrome
          // (AppShell, the lab sheet's shell). Below sm only the mobile bar
          // sticks; from sm to md the PageHeader band (~72px) sticks under
          // that bar; from md up the band alone sticks, at the top.
          scrollMarginTop: {
            xs: layout.mobileBar + 16,
            sm: layout.mobileBar + 88,
            md: 96,
          },
          '&:focus': { outline: 'none' },
          '&:focus-visible': { outline: `2px solid ${warn.dot}`, outlineOffset: 2 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}

/** The "Changed" pill, so the cue is not colour alone. */
export function ChangedPill({ id }: { id?: string }) {
  const { t } = useTranslation('lab');
  return (
    <StatusPill tone="warning" sx={{ flexShrink: 0 }}>
      <span id={id}>{t('orderSheet.diff.changed')}</span>
    </StatusPill>
  );
}
