import { alpha, Box, Divider, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { InitialsAvatar } from '@/components/design/Avatar';
import { brand, motion } from '@/theme/tokens';

type Props = {
  /** Short order identifier, shown next to the patient name. */
  code: string;
  /** Bold first line — patient name. */
  primary: string;
  /** Muted second line — usually "service · counterparty". */
  secondary?: string;
  /** OrderStatusChip (and optionally a payment chip) rendered on the right. */
  status: ReactNode;
  paymentStatus?: ReactNode;
  /** Pre-formatted total string (or "—"). */
  total: string;
  /** When set, renders struck-through above `total` (discount indicator). */
  originalTotal?: string;
  /** Pre-formatted due-date string. */
  dueDate?: string;
  /** Renders the due date in danger colour — overdue or due imminently. */
  dueUrgent?: boolean;
  /** What goes inside the avatar tile — usually patient initials. */
  avatarText: string;
  onClick: () => void;
  /**
   * Optional content rendered below the main row (inside the card, separated by
   * a divider). Clicks inside this area do NOT propagate to the card's onClick.
   */
  footer?: ReactNode;
  /**
   * Paints the resting border in warning yellow so the row stands out — used to
   * flag an unreviewed doctor edit in the lab list.
   */
  highlight?: boolean;
  /**
   * The pipeline bar the mockups draw across the bottom of the row, inside the
   * card's own padding and above any `footer`.
   */
  progress?: ReactNode;
  /** Small tinted note after the patient name — "Lab asked a question". */
  flag?: ReactNode;
  /**
   * "Continues from ORD-1042" badge for a continuation order. Its own prop
   * rather than folded into `flag`, which is already spoken for — an order can
   * both need action and be a continuation, and must show both.
   *
   * Sits in the same wrapping row as the code and `flag`, so it costs no extra
   * line.
   */
  lineage?: ReactNode;
};

/**
 * One order row in the redesigned list: patient and service on the left, due
 * date and money in labelled columns, status pill on the right.
 *
 * Shared by the doctor, lab and clinic order lists — the mockups draw the same
 * row in all three areas.
 */
export function OrderRowCard({
  code,
  primary,
  secondary,
  status,
  paymentStatus,
  total,
  originalTotal,
  dueDate,
  dueUrgent,
  avatarText,
  onClick,
  footer,
  highlight,
  progress,
  flag,
  lineage,
}: Props) {
  const { t } = useTranslation('common');

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
      sx={{
        borderRadius: '15px',
        border: 1,
        borderColor: highlight ? 'warning.main' : 'divider',
        bgcolor: 'background.paper',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: `border-color ${motion.base}, box-shadow ${motion.base}`,
        '&:hover': {
          borderColor: alpha(brand.main, 0.6),
          boxShadow: `0 8px 24px ${alpha(brand.main, 0.12)}`,
        },
        '&:focus-visible': {
          outline: 'none',
          borderColor: 'primary.main',
          boxShadow: `0 0 0 3px ${alpha(brand.main, 0.32)}`,
        },
      }}
    >
      <Box sx={{ px: 2.5, py: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'auto 1fr', md: 'auto minmax(0, 1fr) auto' },
          gridTemplateAreas: {
            xs: `"avatar info" "meta meta"`,
            md: `"avatar info meta"`,
          },
          gap: { xs: 1.5, md: 2.25 },
          alignItems: 'center',
        }}
      >
        <InitialsAvatar name={avatarText} size={40} sx={{ gridArea: 'avatar' }} />

        <Box sx={{ gridArea: 'info', minWidth: 0 }}>
          <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1.125 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, minWidth: 0 }} noWrap>
              {primary}
            </Typography>
            <Typography
              component="span"
              sx={{ fontSize: '0.71875rem', fontWeight: 700, color: 'primary.dark', flexShrink: 0 }}
            >
              {code}
            </Typography>
            {flag}
            {lineage}
          </Stack>
          {secondary && (
            <Typography
              sx={{ fontSize: '0.78125rem', color: 'text.secondary', mt: 0.25 }}
              noWrap
            >
              {secondary}
            </Typography>
          )}
        </Box>

        <Stack
          direction="row"
          spacing={2.25}
          alignItems="center"
          sx={{ gridArea: 'meta', flexShrink: 0, flexWrap: 'wrap', gap: 1.5 }}
        >
          {dueDate && (
            <Box sx={{ textAlign: { md: 'right' } }}>
              <Typography
                sx={{ fontSize: '0.65625rem', fontWeight: 600, color: 'text.secondary' }}
              >
                {t('orderCard.due')}
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.78125rem',
                  fontWeight: 700,
                  color: dueUrgent ? 'error.main' : 'text.primary',
                }}
              >
                {dueDate}
              </Typography>
            </Box>
          )}

          <Box sx={{ textAlign: { md: 'right' } }}>
            <Typography sx={{ fontSize: '0.65625rem', fontWeight: 600, color: 'text.secondary' }}>
              {t('orderCard.total')}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="baseline">
              {originalTotal && (
                <Typography
                  sx={{
                    fontSize: '0.6875rem',
                    textDecoration: 'line-through',
                    color: 'text.secondary',
                  }}
                >
                  {originalTotal}
                </Typography>
              )}
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 800 }}>{total}</Typography>
            </Stack>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {status}
            {paymentStatus}
          </Stack>
        </Stack>
      </Box>

        {progress && <Box sx={{ mt: 1.625 }}>{progress}</Box>}
      </Box>

      {footer && (
        <Box onClick={(e) => e.stopPropagation()}>
          <Divider />
          {footer}
        </Box>
      )}
    </Box>
  );
}
