import { useMemo } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { LabApprovalBanner } from '@/features/lab/LabApprovalBanner';
import { OrderStatusChip } from '@/components/OrderStatusChip';
import {
  Callout,
  CardStack,
  Icon,
  PageHeader,
  SectionCard,
  StatCard,
  StatGrid,
} from '@/components/design';
import { formatGEL } from '@/utils/pricing';
import type { OrderRow } from '@/types/database';

type DueRow = Pick<
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
  service_snapshot: { name?: string } | null;
};

/**
 * The lab's landing screen, built to the Lab Dashboard mockup: a greeting with
 * two actions, four metrics, a due-soon list and an attention column.
 */
export function LabDashboardPage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const lab = user?.lab;
  const labId = lab?.id;
  const navigate = useNavigate();
  const approved = lab?.approval_status === 'APPROVED_ACTIVE';

  const today = dayjs().format('YYYY-MM-DD');
  const dayPlus2 = dayjs().add(2, 'day').format('YYYY-MM-DD');
  const weekEnd = dayjs().add(7, 'day').format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

  // Open orders, with just enough on each row to render the due-soon list and
  // every count on this screen from one request.
  const { data: openOrders = [] } = useQuery({
    queryKey: ['lab-dashboard-open', labId],
    enabled: !!labId && approved,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_code, status, payment_status, final_total, generated_total, requested_due_date, confirmed_due_date, requested_due_time, confirmed_due_time, service_snapshot, ' +
            'patients(first_name, last_name)',
        )
        .eq('lab_id', labId!)
        .not('status', 'in', '(COMPLETED,CANCELLED)');
      if (error) throw error;
      return (data ?? []) as unknown as DueRow[];
    },
  });

  const { data: unpaid = { count: 0, total: 0 } } = useQuery({
    queryKey: ['lab-dashboard-unpaid', labId],
    enabled: !!labId && approved,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('final_total, generated_total')
        .eq('lab_id', labId!)
        .neq('payment_status', 'PAID')
        .in('status', ['SENT_TO_CLINIC', 'RECEIVED_BY_CLINIC', 'COMPLETED']);
      if (error) throw error;
      const rows = data ?? [];
      return {
        count: rows.length,
        total: rows.reduce((s, r) => s + (r.final_total ?? r.generated_total ?? 0), 0),
      };
    },
  });

  const { data: unreviewedEditsCount = 0 } = useQuery({
    queryKey: ['lab-unreviewed-edits-count', labId],
    enabled: !!labId && approved,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('lab_id', labId!)
        .eq('has_unreviewed_edits', true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const stats = useMemo(() => {
    const due = (o: DueRow) => o.confirmed_due_date ?? o.requested_due_date;
    const dated = openOrders.filter((o) => due(o) != null);
    return {
      fresh: openOrders.filter((o) => o.status === 'SUBMITTED').length,
      inProgress: openOrders.filter((o) =>
        ['IN_PROGRESS', 'TRY_IN_PHASE', 'RECEIVED'].includes(o.status),
      ).length,
      overdue: dated.filter((o) => due(o)! < today).length,
      dueSoon: dated.filter((o) => due(o)! >= today && due(o)! <= dayPlus2).length,
      dueThisWeek: dated.filter((o) => due(o)! >= today && due(o)! <= weekEnd).length,
      // Both asks: an order parked waiting on the doctor is the same
      // "we cannot proceed" for the lab either way, and counting only one of
      // them let the dashboard claim all-clear with work blocked.
      needsClarification: openOrders.filter(
        (o) => o.status === 'NEEDS_CLARIFICATION' || o.status === 'NEEDS_DOCTOR_INPUT',
      ).length,
      noFinalPrice: openOrders.filter((o) => o.final_total == null).length,
      upcoming: [...dated]
        .sort((a, b) => due(a)!.localeCompare(due(b)!))
        .slice(0, 5),
    };
  }, [openOrders, today, dayPlus2, weekEnd]);

  return (
    <>
      <PageHeader
        size="h3"
        title={t('dashboard.welcome', {
          name: user ? `${user.first_name} ${user.last_name}` : '',
        })}
        subtitle={dayjs().format('dddd, MMMM D')}
        actions={
          <>
            <Button
              component={RouterLink}
              to="/lab/services"
              variant="outlined"
              startIcon={<Icon name="add" size={17} />}
            >
              {t('dashboard.addService')}
            </Button>
            <Button
              component={RouterLink}
              to="/lab/orders"
              variant="contained"
              endIcon={<Icon name="arrow_forward" size={16} />}
            >
              {t('dashboard.viewOrders')}
            </Button>
          </>
        }
      />

      <CardStack>
        {lab && <LabApprovalBanner status={lab.approval_status} note={lab.approval_note} />}

        {!approved ? (
          <SectionCard>
            <Typography color="text.secondary">{t('dashboard.comingSoon')}</Typography>
          </SectionCard>
        ) : (
          <>
            <StatGrid>
              <StatCard
                dotColor="#F59E0B"
                label={t('dashboard.newOrders')}
                value={stats.fresh}
                caption={t('dashboard.newOrdersHint')}
              />
              <StatCard
                dotColor="#9292FF"
                label={tc('orderStatus.IN_PROGRESS')}
                value={stats.inProgress}
                caption={t('dashboard.openOrders')}
              />
              <StatCard
                dotColor="#DC2626"
                label={t('dashboard.dueThisWeek')}
                value={stats.dueThisWeek}
                caption={t('dashboard.overdueCount', { n: stats.overdue })}
              />
              <StatCard
                dotColor="#16A34A"
                label={t('dashboard.unpaidDelivered')}
                value={formatGEL(unpaid.total)}
                caption={t('dashboard.acrossOrders', { n: unpaid.count })}
              />
            </StatGrid>

            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', lg: '1.5fr 1fr' },
                alignItems: 'flex-start',
              }}
            >
              <SectionCard
                title={t('dashboard.dueSoonTitle')}
                actions={
                  <Button component={RouterLink} to="/lab/orders" size="small">
                    {t('dashboard.viewAll')}
                  </Button>
                }
                dense
              >
                {stats.upcoming.length === 0 ? (
                  <Typography color="text.secondary" sx={{ px: 3, pb: 2.75 }}>
                    {t('dashboard.nothingDue')}
                  </Typography>
                ) : (
                  stats.upcoming.map((o) => {
                    const due = (o.confirmed_due_date ?? o.requested_due_date)!;
                    const urgent = due <= dayPlus2;
                    const patient = o.patients
                      ? `${o.patients.first_name} ${o.patients.last_name}`
                      : '—';
                    return (
                      <Stack
                        key={o.id}
                        direction="row"
                        alignItems="center"
                        spacing={1.5}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/lab/orders/${o.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') navigate(`/lab/orders/${o.id}`);
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
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700 }} noWrap>
                            {o.order_code} · {patient}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {o.service_snapshot?.name ?? ''}
                          </Typography>
                        </Box>
                        <OrderStatusChip status={o.status} />
                      </Stack>
                    );
                  })
                )}
              </SectionCard>

              <SectionCard title={t('dashboard.attention')}>
                <Stack spacing={1.125}>
                  {unreviewedEditsCount > 0 && (
                    <Callout
                      tone="warning"
                      icon="difference"
                      title={t('dashboard.editedOrdersBox.count', { n: unreviewedEditsCount })}
                      onClick={() => navigate('/lab/edited-orders')}
                    />
                  )}
                  {stats.needsClarification > 0 && (
                    <Callout
                      tone="danger"
                      icon="contact_support"
                      title={t('dashboard.clarificationCount', { n: stats.needsClarification })}
                      onClick={() => navigate('/lab/orders')}
                    />
                  )}
                  {stats.overdue > 0 && (
                    <Callout
                      tone="danger"
                      icon="event_busy"
                      title={t('dashboard.overdueCount', { n: stats.overdue })}
                      onClick={() => navigate('/lab/orders', { state: { dueTo: yesterday } })}
                    />
                  )}
                  {stats.dueSoon > 0 && (
                    <Callout
                      tone="warning"
                      icon="event_upcoming"
                      title={t('dashboard.dueSoonCount', { n: stats.dueSoon })}
                      onClick={() =>
                        navigate('/lab/orders', { state: { dueFrom: today, dueTo: dayPlus2 } })
                      }
                    />
                  )}
                  {stats.noFinalPrice > 0 && (
                    <Callout
                      tone="neutral"
                      icon="payments"
                      title={t('dashboard.noFinalPriceCount', { n: stats.noFinalPrice })}
                      onClick={() => navigate('/lab/orders')}
                    />
                  )}
                  {unreviewedEditsCount === 0 &&
                    stats.needsClarification === 0 &&
                    stats.overdue === 0 &&
                    stats.dueSoon === 0 &&
                    stats.noFinalPrice === 0 && (
                      <Typography color="text.secondary" variant="body1">
                        {t('dashboard.allClear')}
                      </Typography>
                    )}
                </Stack>
              </SectionCard>
            </Box>
          </>
        )}
      </CardStack>
    </>
  );
}
