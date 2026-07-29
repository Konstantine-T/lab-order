import { alpha, Box, Divider, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
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
};

// Deterministic avatar colour, so a given patient keeps the same tile across
// renders. Matches the mockups, where each row has its own tile colour.
const AVATAR_COLORS = ['#8A5CF6', '#6E6EE8', '#EC4899', '#10B981', '#F59E0B', '#0EA5E9'];

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
}: Props) {
  const { t } = useTranslation('common');

  const initials =
    avatarText
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || '·';

  let hash = 0;
  for (let i = 0; i < avatarText.length; i += 1) hash += avatarText.charCodeAt(i);
  const avatarBg = AVATAR_COLORS[hash % AVATAR_COLORS.length];

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
          px: 2.5,
          py: 2,
        }}
      >
        <Box
          sx={{
            gridArea: 'avatar',
            width: 40,
            height: 40,
            borderRadius: '12px',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            bgcolor: avatarBg,
            color: '#fff',
            fontWeight: 800,
            fontSize: '0.75rem',
          }}
          aria-hidden
        >
          {initials}
        </Box>

        <Box sx={{ gridArea: 'info', minWidth: 0 }}>
          <Stack direction="row" spacing={1.125} alignItems="center" flexWrap="wrap">
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, minWidth: 0 }} noWrap>
              {primary}
            </Typography>
            <Typography
              component="span"
              sx={{ fontSize: '0.71875rem', fontWeight: 700, color: 'primary.dark', flexShrink: 0 }}
            >
              {code}
            </Typography>
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

      {footer && (
        <Box onClick={(e) => e.stopPropagation()}>
          <Divider />
          {footer}
        </Box>
      )}
    </Box>
  );
}
