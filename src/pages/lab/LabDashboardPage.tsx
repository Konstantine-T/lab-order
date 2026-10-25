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
import {
  CLOSED_STATUSES,
  matchesPreset,
  type OrderPreset,
  queueDates,
} from '@/features/lab/orders/orderPresets';
import { FromLabBadge } from '@/features/lab/orders/FromLabBadge';
import { isLabPurchase, patientLabel } from '@/features/lab/orders/labCustomer';
import {
  defaultReceivableFilters,
  fetchReceivablesByCustomer,
  OWED_PAYMENT_STATUSES as UNPAID_STATUSES,
} from '@/features/lab/finances/financeApi';

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
  | 'buyer_lab_id'
  | 'patient_reference'
> & {
  patients: { first_name: string; last_name: string } | null;
  service_snapshot: { name?: string } | null;
  doctor_snapshot: { is_lab?: boolean } | null;
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

  const { today, dayPlus2 } = queueDates();

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
            'buyer_lab_id, patient_reference, doctor_snapshot, patients(first_name, last_name)',
        )
        // Not left to RLS: from 0048 the owner also reads its own purchases
        // from other labs, which are not this lab's work.
        .eq('lab_id', labId!)
        // Every preset below needs a status outside these, so counting over
        // this subset equals counting over all of the lab's orders.
        .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`);
      if (error) throw error;
      return (data ?? []) as unknown as DueRow[];
    },
  });

  // Counted over exactly what the finances page lists for unpaid + partially
  // paid — the same RPC with the same filters — so the square and the list it
  // opens agree: every non-cancelled order with a final price that still owes
  // money, and the amount still owed on them (the finances page's
  // "Outstanding").
  const { data: unpaid = { count: 0, total: 0 } } = useQuery({
    queryKey: ['lab-dashboard-unpaid', labId],
    enabled: !!labId && approved,
    queryFn: async () => {
      const rows = await fetchReceivablesByCustomer(labId!, {
        ...defaultReceivableFilters,
        statuses: [...UNPAID_STATUSES],
      });
      return {
        count: rows.reduce((s, r) => s + Number(r.order_count), 0),
        total: rows.reduce((s, r) => s + Number(r.total_outstanding), 0),
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

  // Every count is the preset the click applies on the orders page
  // (orderPresets), so the number and the rows it opens onto cannot disagree.
  const stats = useMemo(() => {
    const d = queueDates();
    const count = (p: OrderPreset) => openOrders.filter((o) => matchesPreset(o, p, d)).length;
    const due = (o: DueRow) => o.confirmed_due_date ?? o.requested_due_date;
    const dated = openOrders.filter((o) => due(o) != null);
    return {
      fresh: count('new'),
      inProgress: count('inProgress'),
      overdue: count('overdue'),
      dueSoon: count('dueSoon'),
      dueThisWeek: count('dueThisWeek'),
      // Both asks: an order parked waiting on the doctor is the same
      // "we cannot proceed" for the lab either way, and counting only one of
      // them let the dashboard claim all-clear with work blocked.
      needsClarification: count('clarification'),
      noFinalPrice: count('noFinalPrice'),
      upcoming: [...dated]
        .sort((a, b) => due(a)!.localeCompare(due(b)!))
        .slice(0, 5),
    };
    // `today` is the key for the day the presets measure from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOrders, today]);

  const openPreset = (preset: OrderPreset) => navigate('/lab/orders', { state: { preset } });
  const showLabel = (label: string, value: string | number) =>
    tc('statCard.show', { label, value });

  return (
    <>
      <PageHeader
        size="h3"
        // The page welcomes the business, so the lab's own name — the sidebar
        // and account menu keep the person's. The person's name is only the
        // fallback for a lab row without one (public_name is set at signup).
        title={
          // A company name is longer than a first name; let it wrap.
          <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
            {t('dashboard.welcome', {
              name:
                lab?.public_name?.trim() ||
                (user ? `${user.first_name} ${user.last_name}`.trim() : ''),
            })}
          </Box>
        }
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
              {/* A square reading 0 has nothing to open, so it gets no
                  onClick and renders as plain text. */}
              <StatCard
                dotColor="#F59E0B"
                label={t('dashboard.newOrders')}
                value={stats.fresh}
                caption={t('dashboard.newOrdersHint')}
                onClick={stats.fresh > 0 ? () => openPreset('new') : undefined}
                ariaLabel={showLabel(t('dashboard.newOrders'), stats.fresh)}
              />
              <StatCard
                dotColor="#9292FF"
                label={tc('orderStatus.IN_PROGRESS')}
                value={stats.inProgress}
                caption={t('dashboard.openOrders')}
                onClick={stats.inProgress > 0 ? () => openPreset('inProgress') : undefined}
                ariaLabel={showLabel(tc('orderStatus.IN_PROGRESS'), stats.inProgress)}
              />
              <StatCard
                dotColor="#DC2626"
                label={t('dashboard.dueThisWeek')}
                value={stats.dueThisWeek}
                caption={t('dashboard.overdueCount', { n: stats.overdue })}
                onClick={stats.dueThisWeek > 0 ? () => openPreset('dueThisWeek') : undefined}
                ariaLabel={showLabel(t('dashboard.dueThisWeek'), stats.dueThisWeek)}
              />
              <StatCard
                dotColor="#16A34A"
                label={t('dashboard.unpaidDelivered')}
                value={formatGEL(unpaid.total)}
                caption={t('dashboard.acrossOrders', { n: unpaid.count })}
                // Applied by the finances page once its passcode lock is open.
                onClick={
                  unpaid.count > 0
                    ? () =>
                        navigate('/lab/finances', {
                          state: { paymentStatuses: [...UNPAID_STATUSES] },
                        })
                    : undefined
                }
                ariaLabel={showLabel(t('dashboard.unpaidDelivered'), formatGEL(unpaid.total))}
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
                    const patient = patientLabel(o);
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
                          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                            <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                              {o.service_snapshot?.name ?? ''}
                            </Typography>
                            {isLabPurchase(o) && <FromLabBadge />}
                          </Stack>
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
                      onClick={() => openPreset('clarification')}
                    />
                  )}
                  {stats.overdue > 0 && (
                    <Callout
                      tone="danger"
                      icon="event_busy"
                      title={t('dashboard.overdueCount', { n: stats.overdue })}
                      onClick={() => openPreset('overdue')}
                    />
                  )}
                  {stats.dueSoon > 0 && (
                    <Callout
                      tone="warning"
                      icon="event_upcoming"
                      title={t('dashboard.dueSoonCount', { n: stats.dueSoon })}
                      onClick={() => openPreset('dueSoon')}
                    />
                  )}
                  {stats.noFinalPrice > 0 && (
                    <Callout
                      tone="neutral"
                      icon="payments"
                      title={t('dashboard.noFinalPriceCount', { n: stats.noFinalPrice })}
                      onClick={() => openPreset('noFinalPrice')}
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
