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
import {
  appendDueWindow,
  dueDateOf,
  dueTimeOf,
  ORDER_SORTS,
  type OrderSort,
  orderComparator,
} from '@/features/orders/orderDates';
import { useOrderSort } from '@/features/orders/list/useOrderSort';
import { pastDate, shortDate } from '@/features/orders/list/listFormat';
import { ClarificationAskDialog } from '@/features/orders/clarifications/ClarificationAskDialog';
import { formatGEL } from '@/utils/pricing';
import { radii, tone } from '@/theme/tokens';
import type { OrderRow, OrderStatus } from '@/types/database';
import { LAB_SELECTABLE_STATUSES } from '@/types/database';
import { useInvoiceOrderIds } from '@/features/orders/orderFiles/useInvoiceOrderIds';
import {
  DESTINATION_SELECT,
  type DestinationColumns,
  destinationKeyOf,
  destinationLabelOf,
  destinationOptionsFrom,
  doctorOptionsFrom,
} from '@/features/lab/orders/queueFilters';
import { QueueFilterAutocomplete } from '@/features/lab/orders/QueueFilterAutocomplete';
import { LabInvoiceMark } from '@/features/lab/orders/LabInvoiceMark';

const FILTERABLE_STATUSES: readonly OrderStatus[] = [
  'SUBMITTED',
  'RECEIVED',
  'NEEDS_CLARIFICATION',
  'NEEDS_DOCTOR_INPUT',
  'IN_PROGRESS',
  'READY_FOR_DELIVERY',
  'SENT_TO_CLINIC',
  // Reachable again through reopen_order. Without it a reopened order due this
  // week is counted by the tile and hidden by the filter the tile applies.
  // TRY_IN_PHASE stays out: nothing can set it yet (phases.md, Phase 11), so it
  // would be an option that never matches.
  'RECEIVED_BY_CLINIC',
  'COMPLETED',
  'CANCELLED',
] as const;

/** Everything a lab can still act on — what the "due this week" tile counts. */
const OPEN_STATUSES: readonly OrderStatus[] = FILTERABLE_STATUSES.filter(
  (s) => s !== 'COMPLETED' && s !== 'CANCELLED',
);

/** The mockup's quick filters across the top of the queue. */
const QUICK = ['all', 'new', 'inProgress', 'clarification', 'ready', 'edited', 'completed'] as const;
type Quick = (typeof QUICK)[number];

type Row = OrderRow &
  DestinationColumns & {
    lab_services: { name: string } | null;
    service_snapshot: { name?: string } | null;
    patients: { first_name: string; last_name: string } | null;
    order_clarifications: { answered_at: string | null; resolved_by_edit_at: string | null }[];
  };

/**
 * The doctor answered and the case is still parked in NEEDS_CLARIFICATION —
 * i.e. it is waiting on the lab, not on the doctor (0029).
 */
const isAnswered = (row: Row) =>
  row.status === 'NEEDS_CLARIFICATION' &&
  row.order_clarifications.length > 0 &&
  row.order_clarifications.every(
    // Resolved-by-edit counts as closed too, or this highlight never lights
    // up again on an order that once carried an edit request.
    (c) => c.answered_at !== null || c.resolved_by_edit_at !== null,
  );

const matchesQuick = (row: Row, quick: Quick) => {
  switch (quick) {
    case 'all':
      return true;
    case 'new':
      return row.status === 'SUBMITTED';
    case 'inProgress':
      return ['IN_PROGRESS', 'RECEIVED', 'TRY_IN_PHASE'].includes(row.status);
    case 'clarification':
      return row.status === 'NEEDS_CLARIFICATION' || row.status === 'NEEDS_DOCTOR_INPUT';
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
  { key: 'due', width: '132px' },
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
  const [askKind, setAskKind] = useState<'ANSWER' | 'EDIT'>('ANSWER');

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
  // Keyed by doctor_id, and by the normalised destination — see queueFilters.
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  // A preference, not a filter: remembered per area across visits, and left
  // alone by "Clear filters" and the stat tiles. Newest first by default.
  const [sort, setSort] = useOrderSort('lab');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['lab-orders', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_code, doctor_id, status, generated_total, final_total, requested_due_date, confirmed_due_date, requested_due_time, confirmed_due_time, created_at, service_snapshot, doctor_snapshot, has_unreviewed_edits, ' +
            `${DESTINATION_SELECT}, ` +
            'lab_services(name), patients(first_name, last_name), order_clarifications(answered_at, resolved_by_edit_at)',
        )
        .eq('lab_id', labId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  // Which orders already carry an invoice — one query for the page, not one
  // per row. Fails soft to an empty set.
  const invoicedIds = useInvoiceOrderIds({ labId, unacknowledgedOnly: false, enabled: !!labId });

  // Counted over every loaded order, not the filtered set, so the numbers in
  // the dropdowns do not shift as other filters are applied.
  const doctorOptions = useMemo(() => doctorOptionsFrom(orders), [orders]);
  const destinationOptions = useMemo(() => destinationOptionsFrom(orders), [orders]);

  const hasFilters = !!(
    search ||
    quick !== 'all' ||
    statuses.length > 0 ||
    dateFrom?.isValid() ||
    dateTo?.isValid() ||
    doctorId ||
    destination
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
        const due = dueDateOf(row);
        return due != null && due >= from;
      });
    }
    if (dateTo?.isValid()) {
      const to = dateTo.format('YYYY-MM-DD');
      result = result.filter((row) => {
        const due = dueDateOf(row);
        return due != null && due <= to;
      });
    }
    if (doctorId) {
      result = result.filter((row) => row.doctor_id === doctorId);
    }
    if (destination) {
      result = result.filter((row) => destinationKeyOf(row) === destination);
    }
    // The lab's chosen order — newest first unless it picked otherwise. Every
    // comparator is total, so a background refetch never reshuffles equal rows.
    return [...result].sort(orderComparator(sort));
  }, [orders, quick, search, statuses, dateFrom, dateTo, doctorId, destination, sort]);

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
      // Counted over OPEN_STATUSES — the set the tile's click applies — so the
      // number and the rows it opens onto cannot disagree. Identical to "not
      // completed or cancelled" today; it differs only on TRY_IN_PHASE, which
      // nothing can set yet.
      dueThisWeek: orders.filter((o) => {
        if (!OPEN_STATUSES.includes(o.status)) return false;
        const d = dueDateOf(o);
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

  // Back to page 1 whenever what the list shows, or its order, changes.
  const fromKey = dateFrom?.format('YYYY-MM-DD');
  const toKey = dateTo?.format('YYYY-MM-DD');
  useEffect(() => {
    setPage(1);
  }, [search, quick, statuses, fromKey, toKey, doctorId, destination, sort]);

  const clearFilters = () => {
    setSearch('');
    setQuick('all');
    setStatuses([]);
    setDateFrom(null);
    setDateTo(null);
    setDoctorId(null);
    setDestination(null);
  };

  // The stat tiles filter this page in place. They set state directly rather
  // than navigating: the router-state hand-off from the lab dashboard is read
  // only in the useState initialisers above, which a same-route navigate never
  // re-runs. Each starts from a clean slate so the rows match the number on the
  // tile, and each applies whatever reproduces that number exactly — which is
  // not always the nearest quick pill. setPage too: re-clicking the same tile
  // changes no filter, so the reset effect would not fire.
  const showDueThisWeek = () => {
    clearFilters();
    setDateFrom(dayjs().startOf('day'));
    setDateTo(dayjs().add(7, 'day').startOf('day'));
    // The date filter alone would include completed and cancelled orders.
    setStatuses([...OPEN_STATUSES]);
    setAdvancedOpen(true);
    setPage(1);
  };
  const showInProgress = () => {
    clearFilters();
    // The pill means exactly what the tile counts.
    setQuick('inProgress');
    setPage(1);
  };
  const showReady = () => {
    clearFilters();
    // Not the "ready" pill: it also takes sent-to-clinic and received-by-clinic,
    // so a tile reading 2 would open onto 5 rows.
    setStatuses(['READY_FOR_DELIVERY']);
    setAdvancedOpen(true);
    setPage(1);
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
          {/* A tile reading 0 has nothing to show, so it renders as plain,
              non-interactive text (StatTile drops the button role without an
              onClick). */}
          <StatTile
            icon="event_upcoming"
            tone="warning"
            value={stats.dueThisWeek}
            label={t('dashboard.dueThisWeek')}
            onClick={stats.dueThisWeek > 0 ? showDueThisWeek : undefined}
          />
          <StatTile
            icon="difference"
            tone="danger"
            value={stats.edits}
            label={t('ordersDashboard.unreviewedEdits')}
            onClick={stats.edits > 0 ? () => navigate('/lab/edited-orders') : undefined}
          />
          <StatTile
            icon="precision_manufacturing"
            tone="brand"
            value={stats.inProgress}
            label={tc('orderStatus.IN_PROGRESS')}
            onClick={stats.inProgress > 0 ? showInProgress : undefined}
          />
          <StatTile
            icon="package_2"
            tone="success"
            value={stats.ready}
            label={tc('orderStatus.READY_FOR_DELIVERY')}
            onClick={stats.ready > 0 ? showReady : undefined}
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
              {/* In the always-visible row, not behind "More filters": the
                  complaint was that the ordering could not be seen or changed.
                  Drawn at pill height so it sits in the row as one of them. */}
              <Select
                size="small"
                value={sort}
                onChange={(e) => setSort(e.target.value as OrderSort)}
                renderValue={(v) => (
                  <Stack component="span" direction="row" spacing={0.75} alignItems="baseline">
                    <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                      {tc('orderSort.label')}
                    </Box>
                    <span>{tc(`orderSort.${v}`)}</span>
                  </Stack>
                )}
                sx={{
                  ml: 'auto',
                  maxWidth: '100%',
                  bgcolor: 'background.paper',
                  borderRadius: `${radii.control}px`,
                  fontSize: '0.78125rem',
                  fontWeight: 600,
                  '& .MuiSelect-select': { py: 0.75, pl: 1.5, minHeight: 0 },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                }}
              >
                {ORDER_SORTS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {tc(`orderSort.${s}`)}
                  </MenuItem>
                ))}
              </Select>
              <ChoicePill selected={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)}>
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
                {/* Capped so a long selection (the "due this week" tile picks
                    every open status) ellipsises instead of widening the row. */}
                <FormControl size="small" sx={{ minWidth: 190, maxWidth: { sm: 280 } }}>
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
                <QueueFilterAutocomplete
                  label={t('ordersDashboard.columns.doctor')}
                  placeholder={t('ordersDashboard.filters.allDoctors')}
                  options={doctorOptions}
                  value={doctorId}
                  onChange={setDoctorId}
                />
                <QueueFilterAutocomplete
                  label={t('orderSheet.workLocation')}
                  placeholder={t('ordersDashboard.filters.allWorkLocations')}
                  options={destinationOptions}
                  value={destination}
                  onChange={setDestination}
                />
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
              const dueRaw = dueDateOf(row);
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
              const place = destinationLabelOf(row);

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
                      {invoicedIds.has(row.id) && <LabInvoiceMark />}
                    </Box>
                  </Stack>

                  {/* The destination under the doctor rather than as a ninth
                      column: eight is already dense at 1280px. */}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body1" color="text.secondary" noWrap>
                      {doctorName}
                    </Typography>
                    {place.clinic && (
                      <Typography
                        sx={{ fontSize: '0.6875rem', color: 'text.secondary', opacity: 0.8 }}
                        noWrap
                        title={[place.clinic, place.detail].filter(Boolean).join(' · ')}
                      >
                        {place.clinic}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="body1" color="text.secondary" noWrap>
                    {serviceName}
                  </Typography>

                  {/* Created sits under the due date rather than in a column of
                      its own: the two dates are read against each other, and a
                      ninth column would squeeze the rest at 1280px. Both in the
                      locale's short format, as every other list — and created,
                      which looks back, with its year when not this one's. */}
                  <Stack spacing={0.375} sx={{ minWidth: 0 }}>
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
                      {dueRaw
                        ? appendDueWindow(shortDate(dueRaw, tc), dueTimeOf(row), tc)
                        : '—'}
                    </Box>
                    <Typography
                      sx={{ fontSize: '0.625rem', color: 'text.secondary', textAlign: 'center' }}
                      noWrap
                    >
                      {t('orderSheet.createdOn', { date: pastDate(row.created_at, tc) })}
                    </Typography>
                  </Stack>

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
                        if (next === 'NEEDS_CLARIFICATION' || next === 'NEEDS_DOCTOR_INPUT') {
                          setAskOrderId(row.id);
                          setAskKind(next === 'NEEDS_DOCTOR_INPUT' ? 'EDIT' : 'ANSWER');
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
        kind={askKind}
        open={!!askOrderId}
        onClose={() => setAskOrderId(null)}
      />
    </>
  );
}
