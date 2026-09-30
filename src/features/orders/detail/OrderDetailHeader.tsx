import type { ReactNode } from 'react';
import { Box, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, StatusPill } from '@/components/design';
import { statusTone } from '@/components/OrderStatusChip';
import { motion } from '@/theme/tokens';
import { shortDate } from './format';
import { labNameOf, patientNameOf, serviceNameOf, type DetailOrder } from './types';

/**
 * The top of the order screen, as the redesign draws it: a breadcrumb back to
 * the list, "ORD-1058 · service" with the status pill, a line naming the
 * patient, doctor, clinic and the day it was created, and the actions on the
 * right.
 *
 * On a phone it collapses to the mockup's compact bar — a back square, the
 * code over "service · patient" over the work location, the pill — and the
 * actions drop underneath.
 *
 * Not `PageHeader`: that band is sticky and translucent, and the redesign's
 * order screen scrolls its header away with the page under a static top bar.
 */
export function OrderDetailHeader({
  order,
  ordersTo,
  ordersLabel,
  actions,
  doctorOnPhone,
}: {
  order: DetailOrder;
  /** The role's orders list — the breadcrumb root and the phone's back. */
  ordersTo: string;
  ordersLabel: string;
  actions?: ReactNode;
  /**
   * Name the doctor in the phone bar too. A clinic admin acts for several
   * doctors, so "whose case is this" is not obvious there the way it is to
   * the doctor looking at their own order.
   */
  doctorOnPhone?: boolean;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');

  const labName = labNameOf(order);
  const service = serviceNameOf(order);
  const patient = patientNameOf(order);
  const doctor = [order.doctor_snapshot?.first_name, order.doctor_snapshot?.last_name]
    .filter(Boolean)
    .join(' ');
  const doctorLine = doctor ? t('orderDetail.header.doctor', { name: doctor }) : '';
  const loc = order.work_location_snapshot as {
    clinic_name?: string;
    branch_name?: string;
    city?: string;
  } | null;
  const place = [loc?.clinic_name, loc?.branch_name, loc?.city].filter(Boolean).join(', ');
  const meta = [doctorLine, place, t('orderDetail.header.created', { date: shortDate(order.created_at) })]
    .filter(Boolean);

  const pill = (
    <StatusPill tone={statusTone(order.status)} dot sx={{ flexShrink: 0 }}>
      {tc(`orderStatus.${order.status}`)}
    </StatusPill>
  );

  return (
    <Box component="header" sx={{ mb: { xs: 2, sm: 2.5 } }}>
      <Stack
        component="nav"
        aria-label={t('orderDetail.breadcrumb')}
        direction="row"
        spacing={1}
        sx={{ display: { xs: 'none', sm: 'flex' }, mb: 1.5, fontSize: '0.8125rem', color: 'text.secondary' }}
      >
        <Link component={RouterLink} to={ordersTo} sx={{ color: 'text.secondary', fontWeight: 500 }}>
          {ordersLabel}
        </Link>
        <span aria-hidden>›</span>
        <Box component="span" aria-current="page" sx={{ color: 'text.primary' }}>
          {order.order_code}
        </Box>
      </Stack>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        justifyContent="space-between"
        sx={{ gap: { xs: 1.75, md: 3 } }}
      >
        {/* Phone: the mockup's compact bar. */}
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ display: { xs: 'flex', sm: 'none' } }}>
          <Box
            component={RouterLink}
            to={ordersTo}
            aria-label={t('orderDetail.back')}
            sx={{
              width: 38,
              height: 38,
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              borderRadius: '9px',
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              color: 'text.primary',
              transition: `border-color ${motion.base}`,
              '&:hover': { borderColor: 'secondary.main' },
            }}
          >
            <Icon name="arrow_back" size={18} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {[order.order_code, doctorOnPhone ? doctorLine : labName].filter(Boolean).join(' · ')}
            </Typography>
            <Typography component="h1" noWrap sx={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.35 }}>
              {[service, patient].filter(Boolean).join(' · ') || order.order_code}
            </Typography>
            {/* Where the case goes: the meta line that names it is hidden here,
                and a doctor with several clinics needs to see it. A line of its
                own — at the end of the one above, the ellipsis ate all of it. */}
            {place && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {place}
              </Typography>
            )}
          </Box>
          {pill}
        </Stack>

        {/* Tablet and up. */}
        <Box sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1.5, rowGap: 0.5 }}>
            <Typography
              component="h1"
              sx={{
                fontSize: { sm: '1.3125rem', md: '1.5rem' },
                fontWeight: 700,
                lineHeight: 1.25,
                letterSpacing: '-0.01em',
                minWidth: 0,
              }}
            >
              {[order.order_code, service].filter(Boolean).join(' · ')}
            </Typography>
            {pill}
          </Stack>
          <Typography sx={{ mt: 0.75, fontSize: '0.875rem', color: 'text.secondary' }}>
            {patient && (
              <>
                {t('orderDetail.patient')}{' '}
                <Box component="b" sx={{ color: 'text.primary', fontWeight: 600 }}>
                  {patient}
                </Box>
              </>
            )}
            {meta.map((part, i) => (
              <span key={i}>
                {patient || i > 0 ? ' · ' : ''}
                {part}
              </span>
            ))}
          </Typography>
        </Box>

        {actions && (
          <Stack
            direction="row"
            alignItems="center"
            sx={{
              flexShrink: 0,
              flexWrap: 'wrap',
              gap: 1,
              '& > *': { flex: { xs: '1 1 auto', sm: '0 0 auto' } },
            }}
          >
            {actions}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
