import { alpha, Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Icon } from '@/components/design';
import { templateLook } from '@/utils/serviceDefaults';
import { lift, motion } from '@/theme/tokens';

/**
 * The service tile from the Lab Services mockup, shared by the lab's own
 * service list and the public lab profile a doctor orders from: a tinted icon
 * square, the template's name in caps over the service name, a description,
 * a row of fact chips and a footer with one action.
 */
export function ServiceCard({
  templateCode,
  templateLabel,
  name,
  description,
  chips,
  meta,
  action,
  headerAction,
  onClick,
  disabled,
}: {
  templateCode?: string | null;
  templateLabel?: ReactNode;
  name: ReactNode;
  description?: ReactNode;
  /** Fact capsules — turnaround, pricing model, form status. */
  chips?: ReactNode;
  /** Muted footer text at the left of the action. */
  meta?: ReactNode;
  action?: ReactNode;
  /** Control at the top right — the lab's active toggle. */
  headerAction?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const look = templateLook(templateCode);

  return (
    <Stack
      {...(onClick && !disabled ? { role: 'button', tabIndex: 0, onClick } : {})}
      onKeyDown={
        onClick && !disabled
          ? (e) => {
              if (e.key === 'Enter') onClick();
            }
          : undefined
      }
      sx={{
        height: '100%',
        px: 2.75,
        py: 2.5,
        borderRadius: '18px',
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        opacity: disabled ? 0.65 : 1,
        transition: `all ${motion.slow}`,
        ...(onClick &&
          !disabled && {
            cursor: 'pointer',
            '&:hover': {
              borderColor: alpha(look.color, 0.5),
              boxShadow: lift.cardStrong,
            },
          }),
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        <Box
          sx={{
            width: 42,
            height: 42,
            flexShrink: 0,
            borderRadius: '12px',
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha(look.color, 0.12),
          }}
        >
          <Icon name={look.icon} size={21} sx={{ color: look.color }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {templateLabel && (
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'text.secondary',
              }}
              noWrap
            >
              {templateLabel}
            </Typography>
          )}
          <Typography
            sx={{ fontSize: '0.9375rem', fontWeight: 800, letterSpacing: '-0.01em', mt: 0.25 }}
          >
            {name}
          </Typography>
        </Box>
        {headerAction && <Box onClick={(e) => e.stopPropagation()}>{headerAction}</Box>}
      </Stack>

      {description && (
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ mt: 1.25, lineHeight: 1.55 }}
        >
          {description}
        </Typography>
      )}

      {chips && (
        <Stack direction="row" sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
          {chips}
        </Stack>
      )}

      <Box sx={{ flexGrow: 1 }} />

      {(meta || action) && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{ mt: 1.75, pt: 1.625, borderTop: 1, borderColor: 'divider' }}
        >
          {meta && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {meta}
            </Typography>
          )}
          {action && (
            <Box sx={{ ml: 'auto' }} onClick={(e) => e.stopPropagation()}>
              {action}
            </Box>
          )}
        </Stack>
      )}
    </Stack>
  );
}
