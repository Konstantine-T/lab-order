import { useMemo } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { ClinicInvitesCard } from '@/features/clinic/ClinicInvitesCard';
import { OrderStatusChip } from '@/components/OrderStatusChip';
import {
  Callout,
  CardStack,
  Icon,
  InitialsAvatar,
  PageHeader,
  SectionCard,
  StatCard,
  StatGrid,
} from '@/components/design';
import { formatGEL } from '@/utils/pricing';
import type { OrderRow, OrderStatus } from '@/types/database';

type Row = Pick<
  OrderRow,
  | 'id'
  | 'order_code'
  | 'status'
  | 'payment_status'
  | 'final_total'
  | 'generated_total'
  | 'requested_due_date'
  | 'confirmed_due_date'
> & {
  patients: { first_name: string; last_name: string } | null;
  labs: { public_name: string } | null;
  service_snapshot: { name?: string } | null;
  /** Embedded so "needs action" can tell an unanswered question from one the
   *  doctor has already replied to (0029). */
  order_clarifications: { answered_at: string | null }[];
};

/**
 * Is this order still waiting on the doctor?
 *
 * An order with no clarification rows at all predates the feature (or the lab
 * set the status by hand elsewhere), so it keeps the old behaviour and counts.
 */
const awaitsDoctorAnswer = (row: Row) =>
  row.order_clarifications.length === 0 ||
  row.order_clarifications.some((c) => c.answered_at === null);

/** Statuses where the case is live — neither completed nor cancelled. */
const OPEN: readonly OrderStatus[] = [
  'SUBMITTED',
  'RECEIVED',
  'NEEDS_CLARIFICATION',
  'IN_PROGRESS',
  'TRY_IN_PHASE',
  'READY_FOR_DELIVERY',
  'SENT_TO_CLINIC',
  'RECEIVED_BY_CLINIC',
];

/**
 * The doctor's landing screen, built to the dashboard mockup: a greeting, four
 * metrics and a "due soon" list, with anything needing attention called out.
 */
export function DoctorHomePage() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const doctorId = user?.doctor_profile?.id;

  const { data: orders = [] } = useQuery({
    queryKey: ['doctor-home-orders', doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_code, status, payment_status, final_total, generated_total, requested_due_date, confirmed_due_date, service_snapshot, ' +
            'patients(first_name, last_name), labs(public_name), order_clarifications(answered_at)',
        )
        .eq('doctor_id', doctorId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const stats = useMemo(() => {
    const open = orders.filter((o) => OPEN.includes(o.status as OrderStatus));
    const weekEnd = dayjs().add(7, 'day');
    const dueThisWeek = open.filter((o) => {
      const due = o.confirmed_due_date ?? o.requested_due_date;
      return due != null && dayjs(due).isBefore(weekEnd);
    });
    const needsAction = orders.filter(
      (o) =>
        o.status === 'TRY_IN_PHASE' ||
        (o.status === 'NEEDS_CLARIFICATION' && awaitsDoctorAnswer(o)),
    );
    const unpaid = orders
      .filter((o) => o.payment_status !== 'PAID' && o.status !== 'CANCELLED')
      .reduce((sum, o) => sum + (o.final_total ?? o.generated_total ?? 0), 0);
    return { open, dueThisWeek, needsAction, unpaid };
  }, [orders]);

  const dueSoon = useMemo(
    () =>
      [...stats.open]
        .filter((o) => (o.confirmed_due_date ?? o.requested_due_date) != null)
        .sort((a, b) =>
          (a.confirmed_due_date ?? a.requested_due_date ?? '').localeCompare(
            b.confirmed_due_date ?? b.requested_due_date ?? '',
          ),
        )
        .slice(0, 5),
    [stats.open],
  );

  return (
    <>
      <PageHeader
        size="h3"
        title={t('home.welcome', {
          name: user ? `${user.first_name} ${user.last_name}` : '',
        })}
        subtitle={dayjs().format('dddd, MMMM D')}
        actions={
          <>
            <Button component={RouterLink} to="/doctor/orders" variant="outlined">
              {t('nav.orders')}
            </Button>
            <Button
              component={RouterLink}
              to="/doctor/marketplace"
              variant="contained"
              endIcon={<Icon name="arrow_forward" size={16} />}
            >
              {t('orders.newOrder')}
            </Button>
          </>
        }
      />

      <CardStack>
        <ClinicInvitesCard />

        <StatGrid>
          <StatCard
            dotColor="#F59E0B"
            label={tc('orderStatus.SUBMITTED')}
            value={orders.filter((o) => o.status === 'SUBMITTED').length}
            caption={t('home.stats.awaitingLab')}
          />
          <StatCard
            dotColor="#9292FF"
            label={tc('orderStatus.IN_PROGRESS')}
            value={stats.open.length}
            caption={t('home.stats.openCases')}
          />
          <StatCard
            dotColor="#DC2626"
            label={t('home.stats.dueThisWeek')}
            value={stats.dueThisWeek.length}
            caption={t('home.stats.acrossLabs')}
          />
          <StatCard
            dotColor="#16A34A"
            label={t('home.stats.unpaid')}
            value={formatGEL(stats.unpaid)}
            caption={t('home.stats.unpaidCaption')}
          />
        </StatGrid>

        {stats.needsAction.length > 0 && (
          <Callout
            tone="warning"
            icon="contact_support"
            title={t('home.stats.needsAction', { n: stats.needsAction.length })}
            onClick={() => navigate('/doctor/orders')}
          />
        )}

        <SectionCard
          icon="event_upcoming"
          title={t('home.dueSoon')}
          actions={
            <Button component={RouterLink} to="/doctor/orders" size="small">
              {t('home.viewAll')}
            </Button>
          }
          dense
        >
          {dueSoon.length === 0 ? (
            <Typography variant="body1" color="text.secondary" sx={{ px: 3, pb: 2.75 }}>
              {t('home.noDueSoon')}
            </Typography>
          ) : (
            dueSoon.map((o) => {
              const due = o.confirmed_due_date ?? o.requested_due_date!;
              const patient = o.patients
                ? `${o.patients.first_name} ${o.patients.last_name}`
                : '—';
              const urgent = dayjs(due).diff(dayjs(), 'day') <= 1;
              return (
                <Stack
                  key={o.id}
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/doctor/orders/${o.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/doctor/orders/${o.id}`);
                  }}
                  sx={{
                    px: 3,
                    py: 1.625,
                    cursor: 'pointer',
                    borderTop: 1,
                    borderColor: 'divider',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  {/* The mockups' date tile: month over day, tinted by urgency. */}
                  <Box
                    sx={{
                      px: 1.125,
                      py: 0.75,
                      borderRadius: '8px',
                      textAlign: 'center',
                      lineHeight: 1.2,
                      fontSize: '0.6875rem',
                      fontWeight: 800,
                      flexShrink: 0,
                      color: urgent ? 'error.main' : 'warning.dark',
                      bgcolor: urgent ? 'rgba(220,38,38,0.10)' : 'rgba(245,158,11,0.12)',
                    }}
                  >
                    {dayjs(due).format('MMM').toUpperCase()}
                    <br />
                    {dayjs(due).format('D')}
                  </Box>
                  <InitialsAvatar name={patient} size={28} shape="circle" />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700 }} noWrap>
                      {o.order_code} · {patient}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {[o.service_snapshot?.name, o.labs?.public_name]
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  </Box>
                  <OrderStatusChip status={o.status} />
                </Stack>
              );
            })
          )}
        </SectionCard>
      </CardStack>
    </>
  );
}
