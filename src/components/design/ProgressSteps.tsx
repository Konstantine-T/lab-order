import { alpha, Box, Stack, Typography, useTheme } from '@mui/material';
import type { ReactNode } from 'react';
import { Icon } from '@/components/design/Icon';
import { palette2026, surfaces, tone } from '@/theme/tokens';

export type Step = {
  key: string;
  label: ReactNode;
  /** Material Symbols name for the pending/current bubble. */
  icon?: string;
  /** Timestamp under the label, once the step has happened. */
  at?: ReactNode;
  /** A second fact about the step — who is on it, what was confirmed. */
  note?: ReactNode;
};

/**
 * The horizontal case tracker on the doctor's order detail: completed steps in
 * green with a tick, the current one pulsing in brand, later ones outlined and
 * dimmed.
 *
 * Below `sm` it turns vertical — six labelled bubbles never fit on a phone.
 *
 * `variant="track"` is the 2026-09 order screen's version: small dots on a
 * left-aligned rail, the text under each dot rather than centred on it, and a
 * phone list with the date on the right.
 */
export function ProgressSteps({
  steps,
  current,
  /** Renders every step as complete and stops the pulse — a finished case. */
  complete,
  variant = 'bubbles',
  ariaLabel,
}: {
  steps: Step[];
  /** Index of the in-flight step. */
  current: number;
  complete?: boolean;
  variant?: 'bubbles' | 'track';
  /** Names the list for screen readers when no heading sits above it. */
  ariaLabel?: string;
}) {
  const mode = useTheme().palette.mode;
  if (variant === 'track') {
    return <TrackSteps steps={steps} current={current} complete={complete} ariaLabel={ariaLabel} />;
  }
  // "Not yet" is dashed grey; the current stage's label reads in aqua text.
  const dashedColor = surfaces[mode].dashed;
  const activeText = mode === 'light' ? palette2026.aquaText : '#7FDCFB';
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      alignItems={{ xs: 'stretch', sm: 'flex-start' }}
      sx={{
        '@keyframes lo-pulse': {
          '0%': { boxShadow: `0 0 0 0 ${alpha(palette2026.aqua, 0.5)}` },
          '70%': { boxShadow: `0 0 0 7px ${alpha(palette2026.aqua, 0)}` },
          '100%': { boxShadow: `0 0 0 0 ${alpha(palette2026.aqua, 0)}` },
        },
      }}
    >
      {steps.map((step, i) => {
        const done = complete || i < current;
        const active = !complete && i === current;
        const future = !done && !active;

        return (
          <Stack
            key={step.key}
            direction={{ xs: 'row', sm: 'column' }}
            sx={{ flex: 1, minWidth: 0 }}
          >
            <Stack
              direction={{ xs: 'row', sm: 'column' }}
              alignItems="center"
              spacing={{ xs: 1.5, sm: 0.875 }}
              sx={{ textAlign: { sm: 'center' }, opacity: future ? 0.5 : 1, position: 'relative' }}
            >
              {i > 0 && (
                <Box
                  sx={{
                    display: { xs: 'none', sm: 'block' },
                    position: 'absolute',
                    right: 'calc(50% + 20px)',
                    left: 'calc(-50% + 20px)',
                    top: 15,
                    // Reached is solid aqua; not-yet is dashed — the redesign's
                    // "not done" is a dashed line, not a paler solid one.
                    height: 0,
                    borderTop: '2px solid',
                    borderTopStyle: done || active ? 'solid' : 'dashed',
                    borderColor: done || active ? 'success.main' : dashedColor,
                  }}
                />
              )}
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  zIndex: 1,
                  ...(done && { bgcolor: 'success.main', color: '#fff' }),
                  // The current stage is an aqua ring, not a filled bubble:
                  // filled is reserved for stages that are finished.
                  ...(active && {
                    bgcolor: 'background.paper',
                    border: '2px solid',
                    borderColor: 'success.main',
                    color: 'success.main',
                    animation: 'lo-pulse 2s infinite',
                  }),
                  ...(future && {
                    border: '2px dashed',
                    borderColor: dashedColor,
                    color: 'text.secondary',
                  }),
                }}
              >
                <Icon name={done ? 'check' : (step.icon ?? 'radio_button_unchecked')} size={16} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: '0.71875rem',
                    fontWeight: done || active ? 700 : 600,
                    color: active ? activeText : 'text.primary',
                  }}
                >
                  {step.label}
                </Typography>
                {step.at && (
                  <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary' }}>
                    {step.at}
                  </Typography>
                )}
                {step.note && (
                  <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary' }}>
                    {step.note}
                  </Typography>
                )}
              </Box>
            </Stack>
            {i < steps.length - 1 && (
              <Box
                sx={{
                  display: { xs: 'block', sm: 'none' },
                  width: 0,
                  height: 14,
                  ml: '15px',
                  my: 0.5,
                  borderLeft: '2px solid',
                  borderLeftStyle: done ? 'solid' : 'dashed',
                  borderColor: done ? 'success.main' : dashedColor,
                }}
              />
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

/**
 * One stage marker on the track: a filled aqua dot with a tick once done, an
 * aqua dot inside a soft ring for the stage the case is at, and an empty dashed
 * circle for what has not happened yet.
 */
function TrackDot({ state, size }: { state: 'done' | 'active' | 'future'; size: number }) {
  const mode = useTheme().palette.mode;
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        ...(state === 'future'
          ? {
              border: '1.5px dashed',
              borderColor: surfaces[mode].textMuted,
              bgcolor: 'background.paper',
            }
          : { bgcolor: 'success.main', color: 'common.white' }),
        ...(state === 'active' && { boxShadow: `0 0 0 ${size / 6}px ${tone('success', mode).bg}` }),
      }}
    >
      {state === 'done' && (
        <Icon
          name="check"
          size={Math.round(size * 0.6)}
          sx={{ fontVariationSettings: `'FILL' 0, 'wght' 700, 'GRAD' 0, 'opsz' 20` }}
        />
      )}
      {state === 'active' && (
        <Box sx={{ width: size / 3, height: size / 3, borderRadius: '50%', bgcolor: 'common.white' }} />
      )}
    </Box>
  );
}

/** Solid aqua where the case has been, dashed grey where it has not. */
function trackLine(reached: boolean, dashed: string, direction: '90deg' | '180deg') {
  return reached
    ? { bgcolor: 'success.main' }
    : { background: `repeating-linear-gradient(${direction}, ${dashed} 0 5px, transparent 5px 9px)` };
}

function TrackSteps({
  steps,
  current,
  complete,
  ariaLabel,
}: {
  steps: Step[];
  current: number;
  complete?: boolean;
  ariaLabel?: string;
}) {
  const mode = useTheme().palette.mode;
  const dashed = surfaces[mode].dashed;
  const activeText = tone('success', mode).fg;
  const stateOf = (i: number) =>
    complete || i < current ? 'done' : i === current ? 'active' : 'future';
  const last = steps.length - 1;

  const labelSx = (i: number) => {
    const state = stateOf(i);
    return {
      fontSize: '0.8125rem',
      fontWeight: state === 'future' ? 600 : 700,
      lineHeight: 1.45,
      color: state === 'active' ? activeText : state === 'future' ? 'text.secondary' : 'text.primary',
    } as const;
  };

  return (
    <>
      {/* Desktop: a left-aligned rail, each stage's text hanging under its dot. */}
      <Box
        component="ol"
        aria-label={ariaLabel}
        sx={{ display: { xs: 'none', md: 'flex' }, listStyle: 'none', m: 0, p: 0 }}
      >
        {steps.map((step, i) => (
          <Box
            component="li"
            key={step.key}
            aria-current={stateOf(i) === 'active' ? 'step' : undefined}
            sx={{
              // The last stage has no line to draw, so it takes only the room
              // its own text needs instead of an equal share.
              flex: i === last ? '0 1 auto' : 1,
              maxWidth: i === last ? 160 : undefined,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Stack direction="row" alignItems="center">
              <TrackDot state={stateOf(i)} size={24} />
              {i < last && (
                <Box sx={{ flex: 1, height: 3, ...trackLine(stateOf(i + 1) !== 'future', dashed, '90deg') }} />
              )}
            </Stack>
            <Box sx={{ pr: 1.5, minWidth: 0 }}>
              <Typography sx={labelSx(i)}>{step.label}</Typography>
              {(step.at || step.note) && (
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.45 }}>
                  {step.at}
                  {step.at && step.note ? ' · ' : null}
                  {step.note}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Box>

      {/* Phone: one row per stage, the date pushed to the right edge. */}
      <Box
        component="ol"
        aria-label={ariaLabel}
        sx={{ display: { xs: 'block', md: 'none' }, listStyle: 'none', m: 0, p: 0 }}
      >
        {steps.map((step, i) => (
          <Box
            component="li"
            key={step.key}
            aria-current={stateOf(i) === 'active' ? 'step' : undefined}
            sx={{ display: 'flex', gap: 1.5 }}
          >
            <Stack alignItems="center" sx={{ pt: '1px' }}>
              <TrackDot state={stateOf(i)} size={20} />
              {i < last && (
                <Box sx={{ width: 2, flex: 1, minHeight: 12, ...trackLine(stateOf(i + 1) !== 'future', dashed, '180deg') }} />
              )}
            </Stack>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="baseline"
              spacing={1}
              sx={{ flex: 1, minWidth: 0, pb: i < last ? 1.25 : 0 }}
            >
              <Typography sx={{ ...labelSx(i), minWidth: 0 }}>
                {step.label}
                {step.note ? ' · ' : null}
                {step.note}
              </Typography>
              {step.at && (
                <Typography
                  sx={{ fontSize: '0.8125rem', color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {step.at}
                </Typography>
              )}
            </Stack>
          </Box>
        ))}
      </Box>
    </>
  );
}

/**
 * The six-segment mini bar under each order row in the doctor's list: aqua up
 * to and including the current stage, light grey ahead — as the redesign's
 * order cards draw it.
 */
export function ProgressBar({
  total,
  current,
  caption,
  complete,
}: {
  total: number;
  current: number;
  caption?: ReactNode;
  complete?: boolean;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.625}>
      {Array.from({ length: total }, (_, i) => (
        <Box
          key={i}
          sx={{
            flex: 1,
            height: 4,
            borderRadius: '99px',
            bgcolor: complete || i <= current ? 'success.main' : 'divider',
          }}
        />
      ))}
      {caption && (
        <Typography
          sx={{
            fontSize: '0.65625rem',
            fontWeight: 600,
            color: 'text.secondary',
            ml: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {caption}
        </Typography>
      )}
    </Stack>
  );
}
