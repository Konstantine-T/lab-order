import type { ReactNode } from 'react';
import { alpha, Box, Stack, Typography, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { Icon, ProgressBar, StatusPill } from '@/components/design';
import { LineageBadge } from '@/features/orders/LineageBadge';
import { InvoiceBadge } from '@/features/orders/orderFiles/InvoiceBadge';
import { pipelineIndex } from '@/features/orders/pipeline';
import { formatGELShort } from '@/utils/pricing';
import { brand, lift, motion, palette2026, radii, surfaces, tone } from '@/theme/tokens';
import {
  labNameOf,
  openQuestion,
  patientShortName,
  priceOf,
  serviceNameOf,
  type ListOrderRow,
  type OrderGroupKey,
} from './orderListModel';
import { dueLine, relativeAge, shortDate } from './listFormat';

/** The card bar's five stages: sent · confirmed · in progress · ready · delivered. */
const BAR_STAGES = 5;

type Tag = { label: string; tone: 'gold' | 'aqua' | 'muted' };

type Props = {
  row: ListOrderRow;
  /** Which group the card sits in — `groupOf(row)`, passed so the list and the
   *  card cannot disagree. Sets the frame (gold / aqua) and the corner tag. */
  group: OrderGroupKey;
  /** Where the card goes. The whole body is one link. */
  href: string;
  /** Clinic list: the doctor the order was placed for. */
  doctorName?: string;
  /** The order carries an invoice the doctor has not acknowledged (0035). */
  invoiceUnseen?: boolean;
  /** Code of the order this one continues, when known. */
  parentCode?: string;
  /**
   * Buttons under the body — reply, edit, complete. Outside the link, so a
   * button press never also opens the order.
   */
  actions?: ReactNode;
  /** "Now", for a fixture preview; the live list leaves it out. */
  now?: Dayjs;
};

/**
 * One order in the doctor's and the clinic's grouped lists, built to the
 * redesign's board card: code and a state tag, the service, who and where, the
 * lab's open question in gold, a five-stage bar, and the due date with the
 * price.
 *
 * Gold frame when the order is waiting on the doctor, aqua when it is ready.
 */
export function OrderCard({
  row,
  group,
  href,
  doctorName,
  invoiceUnseen,
  parentCode,
  actions,
  now = dayjs(),
}: Props) {
  const { t } = useTranslation('common');
  const mode = useTheme().palette.mode;
  const gold = tone('warning', mode);
  const aqua = tone('success', mode);

  const tag = stateTag(row, group, t, now);
  const question = openQuestion(row);
  // A cancelled order owes nothing; its old estimate would read as a bill.
  const price = row.status === 'CANCELLED' ? null : priceOf(row);
  const stage = pipelineIndex(row.status);
  const service = serviceNameOf(row);
  const who = [patientShortName(row), labNameOf(row)].filter(Boolean).join(' · ');

  const due =
    row.status === 'COMPLETED'
      ? row.completed_at
        ? { text: t('orderList.completedOn', { date: shortDate(row.completed_at, t) }), tone: 'requested' as const }
        : null
      : row.status === 'CANCELLED'
        ? row.cancelled_at
          ? { text: t('orderList.cancelledOn', { date: shortDate(row.cancelled_at, t) }), tone: 'requested' as const }
          : null
        : dueLine(row, t, now);

  const hasBadges = !!row.continues_order_id || invoiceUnseen || row.has_unreviewed_edits;

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: `${radii.card}px`,
        border: 1,
        borderColor:
          group === 'needsYou'
            ? gold.border
            : group === 'ready'
              ? aqua.border
              : surfaces[mode].borderSolid,
        bgcolor:
          group === 'ready'
            ? alpha(palette2026.aqua, mode === 'light' ? 0.06 : 0.08)
            : 'background.paper',
        overflow: 'hidden',
        transition: `border-color ${motion.base}, box-shadow ${motion.base}`,
        '&:hover': { borderColor: alpha(brand.main, 0.6), boxShadow: lift.card },
        '&:has(a:focus-visible)': {
          borderColor: brand.main,
          boxShadow: `0 0 0 3px ${alpha(brand.main, 0.28)}`,
        },
      }}
    >
      <Box
        component={RouterLink}
        to={href}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          px: 2,
          py: 1.75,
          color: 'inherit',
          textDecoration: 'none',
          outline: 'none',
          minWidth: 0,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography
            sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', flexShrink: 0 }}
          >
            {row.order_code}
          </Typography>
          {tag && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.625}
              sx={{
                minWidth: 0,
                fontSize: '0.75rem',
                fontWeight: tag.tone === 'muted' ? 500 : 600,
                color: tag.tone === 'gold' ? gold.fg : tag.tone === 'aqua' ? aqua.fg : 'text.secondary',
              }}
            >
              {tag.tone === 'aqua' && (
                <Box
                  component="span"
                  sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: aqua.dot, flexShrink: 0 }}
                />
              )}
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tag.label}
              </Box>
            </Stack>
          )}
        </Stack>

        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.35 }}>
            {service || '—'}
          </Typography>
          {who && (
            <Typography
              sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}
              noWrap
            >
              {who}
            </Typography>
          )}
          {doctorName && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.5}
              sx={{ mt: 0.25, color: 'text.secondary', minWidth: 0 }}
            >
              <Icon name="stethoscope" size={14} />
              <Typography sx={{ fontSize: '0.75rem', color: 'inherit' }} noWrap>
                {t('orderList.doctorName', { name: doctorName })}
              </Typography>
            </Stack>
          )}
        </Box>

        {hasBadges && (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            <LineageBadge continuesOrderId={row.continues_order_id} parentCode={parentCode} />
            {invoiceUnseen && <InvoiceBadge />}
            {/* The doctor's edit has not been looked at by the lab yet. */}
            {row.has_unreviewed_edits && (
              <StatusPill tone="neutral">
                <Icon name="edit_note" size={13} />
                {t('orderList.editPending')}
              </StatusPill>
            )}
          </Stack>
        )}

        {question && (
          <Box
            sx={{
              px: 1.25,
              py: 1,
              borderRadius: '8px',
              bgcolor: gold.bg,
              color: gold.fg,
              fontSize: '0.75rem',
              lineHeight: 1.4,
              overflowWrap: 'anywhere',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {t('orderList.quoted', { text: question })}
          </Box>
        )}

        {stage != null && (
          <ProgressBar
            total={BAR_STAGES}
            // Six pipeline stages onto five segments: sent, confirmed, in
            // progress, ready, delivered. Handed over and completed both fill
            // the last one; `complete` then paints the whole bar.
            current={Math.min(stage, BAR_STAGES - 1)}
            complete={row.status === 'COMPLETED'}
          />
        )}

        {(due || price) && (
          <Stack
            direction="row"
            alignItems="baseline"
            justifyContent="space-between"
            spacing={1.5}
            sx={{ mt: 'auto', pt: 0.25 }}
          >
            <Typography
              sx={{
                fontSize: '0.75rem',
                minWidth: 0,
                fontWeight: due && due.tone !== 'requested' ? 600 : 500,
                color:
                  due?.tone === 'overdue'
                    ? 'error.main'
                    : due?.tone === 'confirmed'
                      ? aqua.fg
                      : 'text.secondary',
              }}
            >
              {due?.text}
            </Typography>
            {price && (
              <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ flexShrink: 0 }}>
                {price.was != null && (
                  <Typography
                    sx={{
                      fontSize: '0.6875rem',
                      color: 'text.secondary',
                      textDecoration: 'line-through',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatGELShort(price.was)}
                  </Typography>
                )}
                <Typography
                  title={
                    price.kind === 'estimate'
                      ? t('priceBreakdown.estimatedTotal')
                      : t('priceBreakdown.labFinalTotal')
                  }
                  sx={{
                    fontSize: '0.8125rem',
                    fontWeight: price.kind === 'final' ? 700 : 600,
                    color: price.kind === 'final' ? 'text.primary' : 'text.secondary',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {/* An estimate reads as one: the lab has not confirmed it. */}
                  {price.kind === 'estimate' ? '≈ ' : ''}
                  {formatGELShort(price.amount)}
                </Typography>
              </Stack>
            )}
          </Stack>
        )}
      </Box>

      {actions && (
        <Stack
          direction="row"
          alignItems="center"
          sx={{ px: 2, pb: 1.5, pt: 0.25, gap: 1, flexWrap: 'wrap' }}
        >
          {actions}
        </Stack>
      )}
    </Box>
  );
}

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * The corner tag, from what the row actually says:
 *   waiting on you → what is being asked of the doctor, in gold;
 *   sent           → how long ago;
 *   in progress    → the status the lab set;
 *   ready          → "ready", in aqua;
 *   handed over / completed → whether it has been paid, once there is a bill.
 */
function stateTag(row: ListOrderRow, group: OrderGroupKey, t: TranslateFn, now: Dayjs): Tag | null {
  switch (group) {
    case 'needsYou':
      if (row.status === 'NEEDS_CLARIFICATION')
        return { label: t('orderList.quick.needsAnswer'), tone: 'gold' };
      if (row.status === 'NEEDS_DOCTOR_INPUT')
        return { label: t('orderList.tag.needsChange'), tone: 'gold' };
      if (row.status === 'RECEIVED_BY_CLINIC')
        return { label: t('orderList.tag.readyToClose'), tone: 'gold' };
      return { label: t(`orderStatus.${row.status}`), tone: 'gold' };
    case 'sent':
      return { label: relativeAge(row.created_at, t, now), tone: 'muted' };
    case 'inProgress':
      // Still NEEDS_CLARIFICATION but answered: the lab's move again.
      if (row.status === 'NEEDS_CLARIFICATION')
        return { label: t('orderList.tag.answered'), tone: 'muted' };
      return { label: t(`orderStatus.${row.status}`), tone: 'muted' };
    case 'ready':
      return { label: t('orderList.tag.ready'), tone: 'aqua' };
    case 'delivered':
    case 'completed':
      if (row.final_total != null) {
        return {
          label: t(`paymentStatus.${row.payment_status}`),
          tone: row.payment_status === 'PAID' ? 'muted' : 'gold',
        };
      }
      return group === 'delivered'
        ? { label: t(`orderStatus.${row.status}`), tone: 'muted' }
        : null;
    default:
      return null;
  }
}
