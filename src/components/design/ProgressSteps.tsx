import { alpha, Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Icon } from '@/components/design/Icon';
import { brand } from '@/theme/tokens';

export type Step = {
  key: string;
  label: ReactNode;
  /** Material Symbols name for the pending/current bubble. */
  icon?: string;
  /** Timestamp under the label, once the step has happened. */
  at?: ReactNode;
};

/**
 * The horizontal case tracker on the doctor's order detail: completed steps in
 * green with a tick, the current one pulsing in brand, later ones outlined and
 * dimmed.
 *
 * Below `sm` it turns vertical — six labelled bubbles never fit on a phone.
 */
export function ProgressSteps({
  steps,
  current,
  /** Renders every step as complete and stops the pulse — a finished case. */
  complete,
}: {
  steps: Step[];
  /** Index of the in-flight step. */
  current: number;
  complete?: boolean;
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      alignItems={{ xs: 'stretch', sm: 'flex-start' }}
      sx={{
        '@keyframes lo-pulse': {
          '0%': { boxShadow: `0 0 0 0 ${alpha(brand.main, 0.5)}` },
          '70%': { boxShadow: `0 0 0 7px ${alpha(brand.main, 0)}` },
          '100%': { boxShadow: `0 0 0 0 ${alpha(brand.main, 0)}` },
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
                    height: 2,
                    bgcolor: done || active ? 'success.main' : 'divider',
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
                  ...(active && {
                    bgcolor: 'primary.main',
                    color: '#fff',
                    animation: 'lo-pulse 2s infinite',
                  }),
                  ...(future && {
                    border: '2px solid',
                    borderColor: 'divider',
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
                    color: active ? 'primary.dark' : 'text.primary',
                  }}
                >
                  {step.label}
                </Typography>
                {step.at && (
                  <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary' }}>
                    {step.at}
                  </Typography>
                )}
              </Box>
            </Stack>
            {i < steps.length - 1 && (
              <Box
                sx={{
                  display: { xs: 'block', sm: 'none' },
                  width: 2,
                  height: 14,
                  ml: '15px',
                  my: 0.5,
                  bgcolor: done ? 'success.main' : 'divider',
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
 * The six-segment mini bar under each order row in the doctor's list: green
 * behind, brand for the current stage, grey ahead.
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
            bgcolor:
              complete || i < current
                ? 'success.main'
                : i === current
                  ? 'primary.main'
                  : 'divider',
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
