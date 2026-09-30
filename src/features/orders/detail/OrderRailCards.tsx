import type { ReactNode } from 'react';
import { Avatar, Box, Divider, Link, Stack, Typography, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, SectionCard, StatusPill } from '@/components/design';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { DoctorInvoiceBlock } from '@/features/orders/orderFiles/OrderInvoice';
import { appendDueWindow, dueDateOf, dueTimeOf } from '@/features/orders/orderDates';
import { calculatePrice, formatGELShort } from '@/utils/pricing';
import { initialsOf, surfaces, type Tone } from '@/theme/tokens';
import type { LabFormVersionRow, OrderStaffPublicRow, PaymentStatus } from '@/types/database';
import { shortDate, shortName } from './format';
import { labNameOf, type DetailOrder } from './types';

/** "Unpaid" is waiting on the doctor, so gold — not an error. */
const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  UNPAID: 'warning',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
};

/** A caption over one large figure — the price, or the due date. */
function BigFigure({
  label,
  confirmed,
  children,
  caption,
  align = 'left',
}: {
  label: ReactNode;
  confirmed: boolean;
  children: ReactNode;
  caption?: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <Box sx={{ minWidth: 0, textAlign: { xs: align, lg: 'left' } }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        sx={{ justifyContent: { xs: align === 'right' ? 'flex-end' : 'flex-start', lg: 'flex-start' } }}
      >
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>
          {label}
        </Typography>
        {confirmed && <Icon name="check_circle" size={14} filled sx={{ color: 'success.main' }} />}
      </Stack>
      <Box
        sx={{
          fontSize: { xs: '1.375rem', lg: '1.625rem' },
          fontWeight: 700,
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
          mt: 0.25,
        }}
      >
        {children}
      </Box>
      {caption && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {caption}
        </Typography>
      )}
    </Box>
  );
}

/**
 * "Price and due date": the figure the doctor will pay and the day it is due,
 * then the breakdown, the payment state and who is invoiced.
 *
 * The price is the lab's `final_total` once it has set one. Before that it is
 * the estimate, labelled as such — except for a service priced in prose or not
 * priced at all, which has no number to estimate and says so instead of
 * showing a confident 0.
 */
export function PriceDueCard({
  order,
  answers,
  version,
  onInvoiceAcknowledged,
}: {
  order: DetailOrder;
  answers: Record<string, unknown>;
  version: LabFormVersionRow | null | undefined;
  onInvoiceAcknowledged: () => void;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');

  const rush = { type: order.rush_type, value: order.rush_value ?? 0 };
  const result = version ? calculatePrice(version.pricing_configuration_json, answers, rush) : null;
  const priceConfirmed = order.final_total != null;
  const dueConfirmed = order.confirmed_due_date != null;

  let priceLabel = t('orderDetail.price.label');
  let price: ReactNode = '—';
  if (order.final_total != null) {
    priceLabel = t('orderDetail.price.final');
    price = formatGELShort(Number(order.final_total));
  } else if (result?.kind === 'CALCULATED') {
    priceLabel = tc('priceBreakdown.estimatedTotal');
    if (result.total > 0) price = formatGELShort(result.total);
  } else if (result) {
    // A block of its own: inline, it would sit on the big figure's line height.
    price = (
      <Typography component="div" sx={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.4, pt: 0.5 }}>
        {result.kind === 'DESCRIBED'
          ? t('orderDetail.price.described')
          : tc('priceBreakdown.noPricingTitle')}
      </Typography>
    );
  }

  const due = dueDateOf(order);
  const dueWindow = appendDueWindow('', dueTimeOf(order), tc).trim();
  // Once the lab has set its own date, what the doctor originally asked for
  // is still worth seeing — it used to have a row of its own.
  const requestedDiffers =
    dueConfirmed &&
    order.requested_due_date != null &&
    (order.requested_due_date !== order.confirmed_due_date ||
      (order.requested_due_time ?? null) !== (order.confirmed_due_time ?? null));
  const requested = requestedDiffers
    ? t('orderDetail.price.requested', {
        date: appendDueWindow(shortDate(order.requested_due_date!), order.requested_due_time, tc),
      })
    : null;

  const recipient = order.invoice_recipient_snapshot as { type?: string; name?: string } | null;
  const recipientName = recipient?.name?.trim();

  return (
    <SectionCard
      title={t('orderDetail.price.title')}
      accent={priceConfirmed && dueConfirmed ? 'success' : undefined}
      actions={
        priceConfirmed && dueConfirmed ? (
          <StatusPill tone="success">{t('orderDetail.price.confirmed')}</StatusPill>
        ) : undefined
      }
    >
      <Stack spacing={1.75}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
          <BigFigure label={priceLabel} confirmed={priceConfirmed}>
            {price}
          </BigFigure>
          <BigFigure
            align="right"
            label={dueConfirmed ? t('orderDetail.price.due') : t('orderDetail.dueDate')}
            confirmed={dueConfirmed}
            caption={[dueWindow, requested].filter(Boolean).join(' · ') || undefined}
          >
            {due ? shortDate(due) : '—'}
          </BigFigure>
        </Box>

        {version && (
          <>
            <Divider />
            <PriceBreakdown
              variant="plain"
              pricing={version.pricing_configuration_json}
              answers={answers}
              rush={rush}
              finalTotal={order.final_total}
              // The big figure above is written short; so is everything under it.
              format={formatGELShort}
            />
          </>
        )}

        <Divider />
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
          <StatusPill tone={PAYMENT_TONE[order.payment_status]}>
            {tc(`paymentStatus.${order.payment_status}`)}
          </StatusPill>
          {order.payment_status !== 'PAID' && Number(order.paid_total) > 0 && (
            <Typography variant="caption" color="text.secondary">
              {t('orderDetail.price.paid', { amount: formatGELShort(Number(order.paid_total)) })}
            </Typography>
          )}
          {recipientName && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: { sm: 'auto' }, minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {recipient?.type === 'CLINIC'
                ? t('orderDetail.price.invoiceToClinic', { name: recipientName })
                : t('orderDetail.price.invoiceToDoctor', { name: recipientName })}
            </Typography>
          )}
        </Stack>

        {/* Beside the price, not among the attachments: it is a billing
            document, and a doctor looking at it is thinking about money, not
            STL files. Renders nothing when there is no invoice. */}
        <Box sx={{ '&:empty': { display: 'none' } }}>
          <DoctorInvoiceBlock
            orderId={order.id}
            acknowledgedAt={order.invoice_acknowledged_at}
            onAcknowledged={onInvoiceAcknowledged}
          />
        </Box>
      </Stack>
    </SectionCard>
  );
}

/**
 * The lab: its mark, its name as it was when the order was placed, who on its
 * team is assigned, and the way to its public profile.
 */
export function LabCard({
  order,
  staff,
  profileTo,
}: {
  order: DetailOrder;
  staff: OrderStaffPublicRow[];
  profileTo: string;
}) {
  const { t } = useTranslation('doctor');
  const mode = useTheme().palette.mode;
  const labName = labNameOf(order);

  return (
    <SectionCard sx={{ '& > div': { py: 2, px: 2.5 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Avatar
          src={order.labs?.logo_url ?? undefined}
          alt=""
          variant="rounded"
          sx={{
            width: 44,
            height: 44,
            borderRadius: '12px',
            bgcolor: surfaces[mode].chip,
            color: surfaces[mode].chipText,
            fontSize: '0.875rem',
            fontWeight: 700,
          }}
        >
          {initialsOf(labName || '?')}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }} noWrap>
            {labName || '—'}
          </Typography>
          {staff.length > 0 && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block' }}
              title={staff.map((s) => `${s.first_name} ${s.last_name}`).join(', ')}
            >
              {t('orderDetail.labCard.team', {
                names: staff.map((s) => shortName(s.first_name, s.last_name)).join(' · '),
              })}
            </Typography>
          )}
        </Box>
        <Link
          component={RouterLink}
          to={profileTo}
          sx={{ fontSize: '0.8125rem', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {t('orderDetail.labCard.profile')}
        </Link>
      </Stack>
    </SectionCard>
  );
}
