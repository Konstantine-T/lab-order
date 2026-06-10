import { Box, Divider, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

type Props = {
  /** Short order identifier shown as a monospaced badge. */
  code: string;
  /** Bold first line — patient name. */
  primary: string;
  /** Muted second line — usually "service · counterparty". */
  secondary?: string;
  /** OrderStatusChip (and optionally a payment chip) rendered in the middle column. */
  status: ReactNode;
  paymentStatus?: ReactNode;
  /** Pre-formatted total string (or "—"). */
  total: string;
  /** When set, renders as a struck-through line above `total` (discount indicator). */
  originalTotal?: string;
  /** Pre-formatted due-date string. */
  dueDate?: string;
  /** What goes inside the avatar circle — usually patient initials. */
  avatarText: string;
  onClick: () => void;
  /**
   * Optional content rendered below the main row (inside the card, separated by a
   * divider). Clicks inside this area do NOT propagate to the card's onClick.
   */
  footer?: ReactNode;
  /**
   * When true, paints the resting border + accent stripe in warning yellow so
   * the row stands out — used to flag an unreviewed doctor edit in the lab list.
   * Falsy keeps the default divider border exactly as before.
   */
  highlight?: boolean;
};

/** Single order row in the modern card list. Subtle hover lift + tinted shadow,
 *  brand-gradient avatar, monospaced order code badge. Designed to read at a
 *  glance: patient + service first, status middle, money on the right. */
export function OrderRowCard({
  code,
  primary,
  secondary,
  status,
  paymentStatus,
  total,
  originalTotal,
  dueDate,
  avatarText,
  onClick,
  footer,
  highlight,
}: Props) {
  const initials =
    avatarText
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || '·';

  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2.5,
        border: 1,
        // Unreviewed doctor edit → yellow resting border so it's noticed before
        // opening; otherwise the usual subtle divider border.
        borderColor: highlight ? 'warning.main' : 'divider',
        bgcolor: 'background.paper',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition:
          'border-color 200ms ease, box-shadow 220ms ease, transform 220ms ease',
        '&::before': {
          // Brand accent stripe — invisible until hover, slides in from left.
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: highlight ? 'warning.main' : 'primary.main',
          opacity: 0,
          transform: 'translateX(-3px)',
          transition: 'opacity 220ms ease, transform 220ms ease',
        },
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 14px 32px rgba(146, 146, 255, 0.20)'
              : '0 14px 32px rgba(99, 102, 241, 0.10)',
          transform: 'translateY(-1px)',
          '&::before': {
            opacity: 1,
            transform: 'translateX(0)',
          },
        },
        '&:focus-visible': {
          outline: 'none',
          borderColor: 'primary.main',
          boxShadow: '0 0 0 3px rgba(146, 146, 255, 0.32)',
        },
      })}
    >
      {/* ── Main row ── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'auto 1fr',
            md: 'auto minmax(0, 1fr) auto auto',
          },
          gridTemplateAreas: {
            xs: `"avatar info" "status status" "money money"`,
            md: `"avatar info status money"`,
          },
          gap: { xs: 1.25, md: 2.5 },
          alignItems: 'center',
          px: { xs: 2, md: 2.5 },
          py: 2,
        }}
      >
        <Box
          sx={{
            gridArea: 'avatar',
            width: 46,
            height: 46,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            background: 'linear-gradient(135deg, #A6A6FF 0%, #7575F2 100%)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: 0.6,
            boxShadow: '0 6px 14px rgba(117, 117, 242, 0.32)',
          }}
          aria-hidden
        >
          {initials}
        </Box>

        <Stack spacing={0.4} sx={{ gridArea: 'info', minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography
              variant="subtitle1"
              fontWeight={600}
              noWrap
              sx={{ flexShrink: 1, minWidth: 0 }}
            >
              {primary}
            </Typography>
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 0.9,
                py: 0.15,
                fontFamily:
                  'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: 0.6,
                bgcolor: 'action.hover',
                borderRadius: 1,
                color: 'text.secondary',
                flexShrink: 0,
              }}
            >
              {code}
            </Box>
          </Stack>
          {secondary && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {secondary}
            </Typography>
          )}
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ gridArea: 'status' }}
          flexWrap="wrap"
          useFlexGap
        >
          {status}
          {paymentStatus}
        </Stack>

        <Stack
          alignItems={{ xs: 'flex-start', md: 'flex-end' }}
          sx={{ gridArea: 'money', minWidth: { md: 110 } }}
        >
          {originalTotal && (
            <Typography
              variant="caption"
              sx={{ textDecoration: 'line-through', color: 'text.secondary' }}
            >
              {originalTotal}
            </Typography>
          )}
          <Typography variant="subtitle1" fontWeight={700} color={originalTotal ? 'primary.main' : undefined}>
            {total}
          </Typography>
          {dueDate && (
            <Typography variant="caption" color="text.secondary">
              {dueDate}
            </Typography>
          )}
        </Stack>
      </Box>

      {/* ── Optional footer (clicks don't navigate) ── */}
      {footer && (
        <Box onClick={(e) => e.stopPropagation()}>
          <Divider />
          {footer}
        </Box>
      )}
    </Box>
  );
}
