import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  FormControl,
  InputAdornment,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { statusTone } from '@/components/OrderStatusChip';
import {
  ChoicePill,
  type Column,
  DataRow,
  DataTable,
  Icon,
  InitialsAvatar,
  PageHeader,
  Pager,
  PillRow,
  StatGrid,
  StatTile,
} from '@/components/design';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import { ClarificationAskDialog } from '@/features/orders/clarifications/ClarificationAskDialog';
import { formatGEL } from '@/utils/pricing';
import { tone } from '@/theme/tokens';
import type { OrderRow, OrderStatus } from '@/types/database';
import { LAB_SELECTABLE_STATUSES } from '@/types/database';

const FILTERABLE_STATUSES: readonly OrderStatus[] = [
  'SUBMITTED',
  'RECEIVED',
  'NEEDS_CLARIFICATION',
  'IN_PROGRESS',
  'READY_FOR_DELIVERY',
  'SENT_TO_CLINIC',
  'COMPLETED',
  'CANCELLED',
] as const;

/** The mockup's quick filters across the top of the queue. */
const QUICK = ['all', 'new', 'inProgress', 'clarification', 'ready', 'edited', 'completed'] as const;
type Quick = (typeof QUICK)[number];

type Row = OrderRow & {
  lab_services: { name: string } | null;
  service_snapshot: { name?: string } | null;
  patients: { first_name: string; last_name: string } | null;
  order_clarifications: { answered_at: string | null }[];
};

/**
 * The doctor answered and the case is still parked in NEEDS_CLARIFICATION —
 * i.e. it is waiting on the lab, not on the doctor (0029).
 */
const isAnswered = (row: Row) =>
  row.status === 'NEEDS_CLARIFICATION' &&
  row.order_clarifications.length > 0 &&
  row.order_clarifications.every((c) => c.answered_at !== null);

const matchesQuick = (row: Row, quick: Quick) => {
  switch (quick) {
    case 'all':
      return true;
    case 'new':
      return row.status === 'SUBMITTED';
    case 'inProgress':
      return ['IN_PROGRESS', 'RECEIVED', 'TRY_IN_PHASE'].includes(row.status);
    case 'clarification':
      return row.status === 'NEEDS_CLARIFICATION';
    case 'ready':
      return ['READY_FOR_DELIVERY', 'SENT_TO_CLINIC', 'RECEIVED_BY_CLINIC'].includes(row.status);
    case 'edited':
      return !!row.has_unreviewed_edits;
    case 'completed':
      return row.status === 'COMPLETED';
  }
};

const COLUMNS: Column[] = [
  { key: 'code', width: '92px' },
  { key: 'patient', width: 'minmax(0, 1.25fr)' },
  { key: 'doctor', width: 'minmax(0, 1fr)' },
  { key: 'service', width: 'minmax(0, 1.35fr)' },
  { key: 'due', width: '96px' },
  { key: 'status', width: '184px' },
  { key: 'total', width: '76px', align: 'right' },
  { key: 'go', width: '24px' },
];

export function LabOrdersDashboardPage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lab-orders', labId] }),
  });

  // Set from the inline status select: picking "Needs clarification" here has
  // to capture the question too, exactly as it does on the order sheet.
  const [askOrderId, setAskOrderId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  const location = useLocation();

  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<Quick>('all');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(() => {
    const s = location.state as { dueFrom?: string; dueTo?: string } | null;
    return s?.dueFrom ? dayjs(s.dueFrom) : null;
  });
  const [dateTo, setDateTo] = useState<Dayjs | null>(() => {
    const s = location.state as { dueFrom?: string; dueTo?: string } | null;
    return s?.dueTo ? dayjs(s.dueTo) : null;
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['lab-orders', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_code, status, generated_total, final_total, requested_due_date, confirmed_due_date, created_at, service_snapshot, doctor_snapshot, has_unreviewed_edits, ' +
            'lab_services(name), patients(first_name, last_name), order_clarifications(answered_at)',
        )
        .eq('lab_id', labId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const hasFilters = !!(
    search ||
    quick !== 'all' ||
    statuses.length > 0 ||
    dateFrom?.isValid() ||
    dateTo?.isValid()
  );

  const filtered = useMemo(() => {
    let result = orders.filter((row) => matchesQuick(row, quick));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((row) => {
        const ds = row.doctor_snapshot ?? {};
        const doctor = [ds.first_name, ds.last_name].filter(Boolean).join(' ').toLowerCase();
        const patient = row.patients
          ? `${row.patients.first_name} ${row.patients.last_name}`.toLowerCase()
          : '';
        const service = (row.lab_services?.name ?? row.service_snapshot?.name ?? '').toLowerCase();
        return (
          row.order_code.toLowerCase().includes(q) ||
          doctor.includes(q) ||
          patient.includes(q) ||
          service.includes(q)
        );
      });
    }
    if (statuses.length > 0) {
      result = result.filter((row) => statuses.includes(row.status as OrderStatus));
    }
    if (dateFrom?.isValid()) {
      const from = dateFrom.format('YYYY-MM-DD');
      result = result.filter((row) => {
        const due = row.confirmed_due_date ?? row.requested_due_date;
        return due != null && due >= from;
      });
    }
    if (dateTo?.isValid()) {
      const to = dateTo.format('YYYY-MM-DD');
      result = result.filter((row) => {
        const due = row.confirmed_due_date ?? row.requested_due_date;
        return due != null && due <= to;
      });
    }
    return result;
  }, [orders, quick, search, statuses, dateFrom, dateTo]);

  const quickCounts = useMemo(
    () =>
      Object.fromEntries(
        QUICK.map((q) => [q, orders.filter((row) => matchesQuick(row, q)).length]),
      ) as Record<Quick, number>,
    [orders],
  );

  const stats = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD');
    const weekEnd = dayjs().add(7, 'day').format('YYYY-MM-DD');
    const open = orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status));
    return {
      dueThisWeek: open.filter((o) => {
        const d = o.confirmed_due_date ?? o.requested_due_date;
        return d != null && d >= today && d <= weekEnd;
      }).length,
      edits: orders.filter((o) => o.has_unreviewed_edits).length,
      inProgress: open.filter((o) => ['IN_PROGRESS', 'RECEIVED', 'TRY_IN_PHASE'].includes(o.status))
        .length,
      ready: open.filter((o) => o.status === 'READY_FOR_DELIVERY').length,
    };
  }, [orders]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, quick, statuses, dateFrom?.format('YYYY-MM-DD'), dateTo?.format('YYYY-MM-DD')]);

  const clearFilters = () => {
    setSearch('');
    setQuick('all');
    setStatuses([]);
    setDateFrom(null);
    setDateTo(null);
  };

  return (
    <>
      <PageHeader
        title={t('ordersDashboard.title')}
        subtitle={t('ordersDashboard.subtitle')}
        actions={
          <TextField
            placeholder={t('ordersDashboard.filters.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ width: { sm: 280 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Icon name="search" size={18} sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
          />
        }
      />

      <Stack spacing={2.5}>
        <StatGrid>
          <StatTile
            icon="event_upcoming"
            tone="warning"
            value={stats.dueThisWeek}
            label={t('dashboard.dueThisWeek')}
          />
          <StatTile
            icon="difference"
            tone="danger"
            value={stats.edits}
            label={t('ordersDashboard.unreviewedEdits')}
            onClick={() => navigate('/lab/edited-orders')}
          />
          <StatTile
            icon="precision_manufacturing"
            tone="brand"
            value={stats.inProgress}
            label={tc('orderStatus.IN_PROGRESS')}
          />
          <StatTile
            icon="package_2"
            tone="success"
            value={stats.ready}
            label={tc('orderStatus.READY_FOR_DELIVERY')}
          />
        </StatGrid>

        {!isLoading && orders.length > 0 && (
          <Box>
            <PillRow>
              {QUICK.map((q) => (
                <ChoicePill
                  key={q}
                  selected={quick === q}
                  count={quickCounts[q]}
                  onClick={() => setQuick(q)}
                >
                  {t(`ordersDashboard.quick.${q}`)}
                </ChoicePill>
              ))}
              <ChoicePill
                selected={advancedOpen}
                onClick={() => setAdvancedOpen((v) => !v)}
                sx={{ ml: 'auto' }}
              >
                <Icon name="tune" size={15} />
                {t('ordersDashboard.moreFilters')}
              </ChoicePill>
            </PillRow>

            <Collapse in={advancedOpen}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                flexWrap="wrap"
                useFlexGap
                alignItems={{ sm: 'center' }}
                sx={{ mt: 1.75 }}
              >
                <FormControl size="small" sx={{ minWidth: 190 }}>
                  <InputLabel>{t('ordersDashboard.filters.status')}</InputLabel>
                  <Select
                    multiple
                    value={statuses}
                    onChange={(e) => setStatuses(e.target.value as OrderStatus[])}
                    input={<OutlinedInput label={t('ordersDashboard.filters.status')} />}
                    renderValue={(sel) =>
                      sel.length === 0 ? '' : sel.map((s) => tc(`orderStatus.${s}`)).join(', ')
                    }
                  >
                    {FILTERABLE_STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>
                        <Checkbox checked={statuses.includes(s)} size="small" />
                        <ListItemText primary={tc(`orderStatus.${s}`)} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <DatePicker
                  label={t('ordersDashboard.filters.from')}
                  value={dateFrom}
                  onChange={(d) => setDateFrom(d)}
                  format="YYYY-MM-DD"
                  slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
                />
                <DatePicker
                  label={t('ordersDashboard.filters.to')}
                  value={dateTo}
                  onChange={(d) => setDateTo(d)}
                  format="YYYY-MM-DD"
                  slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
                />
                {hasFilters && (
                  <Button size="small" onClick={clearFilters} sx={{ whiteSpace: 'nowrap' }}>
                    {t('ordersDashboard.filters.clear')}
                  </Button>
                )}
              </Stack>
            </Collapse>
          </Box>
        )}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : orders.length === 0 ? (
          <OrdersEmptyState title={t('ordersDashboard.empty')} />
        ) : filtered.length === 0 ? (
          <OrdersEmptyState icon="filter_alt_off" title={t('ordersDashboard.filters.noResults')} />
        ) : (
          <DataTable
            columns={COLUMNS.map((c) =>
              c.key === 'go'
                ? c
                : { ...c, label: t(`ordersDashboard.columns.${c.key}` as const) },
            )}
            footer={
              <>
                <Typography variant="body2" color="text.secondary">
                  {t('ordersDashboard.countFiltered', {
                    count: filtered.length,
                    total: orders.length,
                  })}
                </Typography>
                <Box sx={{ ml: 'auto' }}>
                  <Pager page={page - 1} pageCount={pageCount} onChange={(p) => setPage(p + 1)} />
                </Box>
              </>
            }
          >
            {visible.map((row) => {
              const ds = row.doctor_snapshot ?? {};
              const doctorName = [ds.first_name, ds.last_name].filter(Boolean).join(' ') || '—';
              const patientName = row.patients
                ? `${row.patients.first_name} ${row.patients.last_name}`
                : '—';
              const serviceName = row.lab_services?.name ?? row.service_snapshot?.name ?? '';
              const total = row.final_total ?? row.generated_total;
              const dueRaw = row.confirmed_due_date ?? row.requested_due_date;
              const daysOut = dueRaw ? dayjs(dueRaw).diff(dayjs(), 'day') : null;
              const dueTone =
                daysOut == null || row.status === 'COMPLETED'
                  ? 'neutral'
                  : daysOut <= 1
                    ? 'warning'
                    : daysOut <= 4
                      ? 'info'
                      : 'neutral';

              const answered = isAnswered(row);

              return (
                <DataRow
                  key={row.id}
                  columns={COLUMNS}
                  highlight={row.has_unreviewed_edits || answered}
                  onClick={() => navigate(`/lab/orders/${row.id}`)}
                >
                  <Typography
                    sx={{ fontSize: '0.78125rem', fontWeight: 700, color: 'primary.dark' }}
                    noWrap
                  >
                    {row.order_code}
                  </Typography>

                  <Stack direction="row" alignItems="center" spacing={1.125} sx={{ minWidth: 0 }}>
                    <InitialsAvatar name={patientName} size={28} shape="circle" />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }} noWrap>
                        {patientName}
                      </Typography>
                      {row.has_unreviewed_edits && (
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Box
                            sx={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              bgcolor: 'warning.main',
                            }}
                          />
                          <Typography
                            sx={{
                              fontSize: '0.625rem',
                              fontWeight: 700,
                              color: 'warning.dark',
                            }}
                            noWrap
                          >
                            {t('editedOrders.unconfirmedBadge')}
                          </Typography>
                        </Stack>
                      )}
                      {/* Same treatment as an unreviewed edit: this row is
                          waiting on the lab, not on the doctor. */}
                      {answered && (
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Box
                            sx={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              bgcolor: 'warning.main',
                            }}
                          />
                          <Typography
                            sx={{
                              fontSize: '0.625rem',
                              fontWeight: 700,
                              color: 'warning.dark',
                            }}
                            noWrap
                          >
                            {t('ordersDashboard.answeredBadge')}
                          </Typography>
                        </Stack>
                      )}
                    </Box>
                  </Stack>

                  <Typography variant="body1" color="text.secondary" noWrap>
                    {doctorName}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" noWrap>
                    {serviceName}
                  </Typography>

                  <Box
                    sx={(theme) => ({
                      textAlign: 'center',
                      py: 0.5,
                      borderRadius: 999,
                      fontSize: '0.71875rem',
                      fontWeight: 600,
                      color: tone(dueTone, theme.palette.mode).fg,
                      bgcolor: tone(dueTone, theme.palette.mode).bg,
                    })}
                  >
                    {dueRaw ? dayjs(dueRaw).format('MMM D') : '—'}
                  </Box>

                  {/* The status selector the mockup embeds in the row — a lab
                      changes status straight from the queue. */}
                  <Box onClick={(e) => e.stopPropagation()}>
                    <Select
                      size="small"
                      value={row.status}
                      onChange={(e) => {
                        const next = e.target.value as OrderStatus;
                        // Never savable on its own — the doctor needs the
                        // question, not just the status.
                        if (next === 'NEEDS_CLARIFICATION') {
                          setAskOrderId(row.id);
                          return;
                        }
                        updateStatus.mutate({ orderId: row.id, status: next });
                      }}
                      disabled={updateStatus.isPending}
                      fullWidth
                      sx={{ fontSize: '0.71875rem', '& .MuiSelect-select': { py: 0.75 } }}
                      renderValue={(v) => (
                        <Stack direction="row" alignItems="center" spacing={0.875}>
                          <Box
                            sx={(theme) => ({
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              flexShrink: 0,
                              bgcolor: tone(statusTone(v as OrderStatus), theme.palette.mode).dot,
                            })}
                          />
                          <Typography sx={{ fontSize: '0.71875rem', fontWeight: 600 }} noWrap>
                            {tc(`orderStatus.${v as OrderStatus}`)}
                          </Typography>
                        </Stack>
                      )}
                    >
                      {LAB_SELECTABLE_STATUSES.map((s) => (
                        <MenuItem key={s} value={s}>
                          {tc(`orderStatus.${s}`)}
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>

                  <Typography sx={{ fontSize: '0.78125rem', fontWeight: 700, textAlign: 'right' }}>
                    {total != null ? formatGEL(total) : '—'}
                  </Typography>

                  <Icon name="chevron_right" size={17} sx={{ color: 'text.disabled' }} />
                </DataRow>
              );
            })}
          </DataTable>
        )}
      </Stack>

      <ClarificationAskDialog
        orderId={askOrderId}
        open={!!askOrderId}
        onClose={() => setAskOrderId(null)}
      />
    </>
  );
}
