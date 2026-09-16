import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Icon, InitialsAvatar, StatusPill } from '@/components/design';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import { formatGEL } from '@/utils/pricing';
import { brand, radii } from '@/theme/tokens';
import type { OrderStatus } from '@/types/database';
import { useLandingTones } from './helpers';

/**
 * The two product screens the landing page shows next to its doctor and lab
 * sections.
 *
 * The design leaves these as "screenshot — …" placeholders. A real screenshot
 * would go stale with every release and would have to be retaken in three
 * languages; these are built from the app's own pills, avatars and money
 * formatting instead, so they translate with the page and restyle with the
 * theme. The content is the sample case the July mockups used throughout.
 */

/** The dashed-border frame the design draws around each screenshot slot. */
export function ScreenFrame({ children }: { children: ReactNode }) {
  const tones = useLandingTones();
  return (
    <Box
      sx={{
        bgcolor: tones.subtle,
        border: 1,
        borderColor: 'divider',
        borderRadius: `${radii.card}px`,
        p: 1.75,
        display: 'flex',
        alignItems: 'center',
        minHeight: { md: 460 },
      }}
    >
      <Box sx={{ width: '100%' }}>{children}</Box>
    </Box>
  );
}

const ORDERS: { code: string; status: OrderStatus; due: string; price: number }[] = [
  { code: 'LO-1062', status: 'RECEIVED', due: '2026-08-04', price: 350 },
  { code: 'LO-1058', status: 'IN_PROGRESS', due: '2026-07-31', price: 288 },
  { code: 'LO-1051', status: 'READY_FOR_DELIVERY', due: '2026-08-08', price: 540 },
  { code: 'LO-1047', status: 'NEEDS_CLARIFICATION', due: '2026-08-02', price: 95 },
];

/** A doctor's orders list: code, patient, service, due date, status, price. */
export function OrdersListMock() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  const patients = t('mock.patients', { returnObjects: true }) as string[];
  const services = t('mock.services', { returnObjects: true }) as string[];

  const filter = (label: string, count: number, active?: boolean) => (
    <Box
      sx={{
        fontSize: '0.75rem',
        fontWeight: 600,
        px: 1.5,
        py: 0.625,
        borderRadius: `${radii.chipSm}px`,
        color: active ? 'text.primary' : tones.muted,
        bgcolor: active ? 'background.default' : 'transparent',
        whiteSpace: 'nowrap',
      }}
    >
      {label} · {count}
    </Box>
  );

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: `${radii.tile}px`,
        p: { xs: 2, sm: 2.75 },
        boxShadow: '0 18px 48px rgba(15,23,42,0.08)',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
          {t('mock.orders')}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ ml: 'auto', flexWrap: 'wrap' }}>
          {filter(t('mock.all'), 24, true)}
          {filter(t('mock.dueThisWeek'), 9)}
          {filter(t('mock.needsAttention'), 2)}
        </Stack>
      </Stack>

      <Stack spacing={1} sx={{ mt: 1.75 }}>
        {ORDERS.map((o, i) => (
          // Two lines per row rather than the queue's six columns: the slot
          // is half a content column wide, and six columns there truncate
          // every name. Code and patient lead; service and due date sit
          // under them; status and price hold the right edge.
          <Box
            key={o.code}
            sx={{
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr) auto',
              gap: 1.5,
              alignItems: 'center',
              px: 1.75,
              py: 1.375,
              border: 1,
              borderColor: 'divider',
              borderRadius: `${radii.tile}px`,
              bgcolor: i === 0 ? tones.brandTint.bg : 'transparent',
            }}
          >
            <Typography sx={{ fontSize: '0.78125rem', fontWeight: 700, color: brand.strong }}>
              {o.code}
            </Typography>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }} noWrap>
                {patients[i]}
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0, mt: 0.25 }}>
                <Typography sx={{ fontSize: '0.71875rem', color: 'text.secondary' }} noWrap>
                  {services[i]}
                </Typography>
                <StatusPill
                  tone={i === 0 ? 'info' : i === 1 ? 'warning' : 'neutral'}
                  sx={{ px: 1, py: 0.25, fontSize: '0.625rem', flexShrink: 0 }}
                >
                  {dayjs(o.due).format('D MMM')}
                </StatusPill>
              </Stack>
            </Box>
            <Stack alignItems="flex-end" spacing={0.5}>
              <OrderStatusChip status={o.status} />
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700 }}>{formatGEL(o.price)}</Typography>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

/** A lab's order sheet: status, team, Telegram chat and payment, one row each. */
export function OrderSheetMock() {
  const { t } = useTranslation('landing');
  const { t: tc } = useTranslation('common');
  const tones = useLandingTones();

  const row = (label: string, main: ReactNode, trailing?: ReactNode) => (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        bgcolor: tones.subtle,
        border: 1,
        borderColor: 'divider',
        borderRadius: `${radii.tile}px`,
        px: 1.75,
        py: 1.375,
      }}
    >
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', width: 74, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>{main}</Box>
      {trailing && <Box sx={{ ml: 'auto', flexShrink: 0 }}>{trailing}</Box>}
    </Stack>
  );

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: `${radii.tile}px`,
        p: { xs: 2, sm: 2.75 },
        boxShadow: '0 18px 48px rgba(15,23,42,0.08)',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.25}>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700 }} noWrap>
          LO-1058 · {t('mock.sheetTitle')}
        </Typography>
        <Box sx={{ ml: 'auto', flexShrink: 0 }}>
          <StatusPill tone="warning">{t('mock.due', { date: dayjs('2026-07-31').format('D MMM') })}</StatusPill>
        </Box>
      </Stack>
      <Typography sx={{ mt: 0.375, fontSize: '0.78125rem', color: 'text.secondary' }}>
        {t('mock.sheetMeta')}
      </Typography>

      <Stack spacing={1.125} sx={{ mt: 2.25 }}>
        {row(
          t('mock.status'),
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              bgcolor: tones.brandTint.bg,
              border: 1,
              borderColor: tones.brandTint.border,
              borderRadius: '9px',
              px: 1.5,
              py: 0.75,
              fontSize: '0.78125rem',
              fontWeight: 700,
              color: tones.brandTint.fg,
              whiteSpace: 'nowrap',
            }}
          >
            {tc('orderStatus.IN_PROGRESS')}
            <Icon name="expand_more" size={15} />
          </Box>,
          <Typography sx={{ fontSize: '0.65625rem', color: tones.muted, display: { xs: 'none', sm: 'block' } }}>
            {t('mock.statusHint')}
          </Typography>,
        )}
        {row(
          t('mock.team'),
          <>
            <Stack direction="row" spacing={-0.5}>
              <InitialsAvatar name="Giorgi T" size={24} shape="circle" variant="brand" />
              <InitialsAvatar name="Levan K" size={24} shape="circle" variant="hashed" />
            </Stack>
            <Typography sx={{ fontSize: '0.71875rem', fontWeight: 600 }} noWrap>
              {t('mock.teamNames')}
            </Typography>
          </>,
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              border: '1px dashed',
              borderColor: 'text.disabled',
              borderRadius: `${radii.chipSm}px`,
              px: 1.25,
              py: 0.5,
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'text.secondary',
            }}
          >
            <Icon name="add" size={14} />
            {t('mock.assign')}
          </Box>,
        )}
        {row(
          t('mock.chat'),
          <>
            <Box
              sx={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                bgcolor: '#54A9EB',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="send" size={13} filled />
            </Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }} noWrap>
              {t('mock.chatLine')}
            </Typography>
          </>,
          <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: brand.strong }}>
            {t('mock.open')} →
          </Typography>,
        )}
        {row(
          t('mock.payment'),
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700 }} noWrap>
            {t('mock.finalTotal')} {formatGEL(288)}
          </Typography>,
          <PaymentStatusChip status="UNPAID" />,
        )}
      </Stack>
    </Box>
  );
}
