import type { ReactNode } from 'react';
import { alpha, Box, Stack, Typography, useTheme, type SxProps, type Theme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { StatusPill } from '@/components/design';
import { toDisplayLabel } from '@/components/ToothMap';
import { changedToothRing, layout, radii, tone } from '@/theme/tokens';

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

/**
 * The line under a tooth chart naming the teeth the edit changed, in the
 * chart's own notation ("Changed: 14, 15"), so the ring on the chart is not
 * the only cue. It lists removed teeth too, which the chart no longer draws as
 * selected. Renders nothing when no tooth changed.
 */
export function ChangedTeethNote({
  teeth,
  notation = 'FDI',
  sx,
}: {
  /** Universal numbers, as `useChangedTeeth` returns them. */
  teeth: readonly number[] | undefined;
  /** What the chart is labelled in; ToothMap's own default is FDI. */
  notation?: 'Universal' | 'FDI';
  sx?: SxProps<Theme>;
}) {
  const { t } = useTranslation('lab');
  const mode = useTheme().palette.mode;
  if (!teeth || teeth.length === 0) return null;
  const ring = changedToothRing(mode);
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      data-changed-teeth={teeth.join(',')}
      sx={[{ minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <Box component="svg" viewBox="0 0 14 14" aria-hidden sx={{ width: 14, height: 14, flexShrink: 0 }}>
        <circle cx={7} cy={7} r={5} fill="none" stroke={ring.band} strokeWidth={3.5} />
        <circle cx={7} cy={7} r={5} fill="none" stroke={ring.line} strokeWidth={1.4} />
      </Box>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: tone('warning', mode).fg }}>
        {t('orderSheet.diff.changed')}: {teeth.map((n) => toDisplayLabel(n, notation)).join(', ')}
      </Typography>
    </Stack>
  );
}
