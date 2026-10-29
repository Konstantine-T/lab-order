import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
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
import { statusLabel } from '@/features/orders/statusLabel';
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
import { ORDER_TRASH_EMBED } from '@/features/orders/trash/trashFilter';
import { TrashSelectionBar } from '@/features/orders/trash/TrashSelection';
import { useOrderSelection } from '@/features/orders/trash/useOrderSelection';
import { labSideKeeper } from '@/features/orders/trash/trashKeeper';
import { TrashLink } from '@/features/orders/trash/TrashLink';
import { useTrashToast } from '@/features/orders/trash/useTrashToast';
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
import { canTrash, LAB_SELECTABLE_STATUSES } from '@/types/database';
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
import { FromLabBadge } from '@/features/lab/orders/FromLabBadge';
import {
  CUSTOMER_KINDS,
  type CustomerKind,
  isLabPurchase,
  matchesCustomerKind,
  patientLabel,
} from '@/features/lab/orders/labCustomer';
import {
  CLOSED_STATUSES,
  FILTERABLE_STATUSES,
  isOrderPreset,
  matchesPreset,
  matchesQueueFilter,
  matchesQueueQuick as matchesQuick,
  type OrderPreset,
  presetFilter,
  QUEUE_QUICK as QUICK,
  queueDates,
  type QueueQuick as Quick,
} from '@/features/lab/orders/orderPresets';

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

/** Select mode's checkbox column (0054), in front of the rest. */
const SELECT_COLUMN: Column = { key: 'select', width: '28px' };

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
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId)
        .eq('lab_id', labId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lab-orders', labId] }),
  });

  // Set from the inline status select: picking "Needs clarification" here has
  // to capture the question too, exactly as it does on the order sheet.
  const [askOrderId, setAskOrderId] = useState<string | null>(null);
  const [askKind, setAskKind] = useState<'ANSWER' | 'EDIT'>('ANSWER');

  // The lab's side of the trash (0054): bulk select on finished rows, and the
  // toast with Undo after a trash here or on the order sheet.
  const selection = useOrderSelection();
  const trashToast = useTrashToast('LAB');

  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  const location = useLocation();

  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<Quick>('all');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  // Preset-only (the dashboard's "No final price"): a removable chip, not a
  // quick pill.
  const [noFinalPrice, setNoFinalPrice] = useState(false);
  // Keyed by doctor_id, and by the normalised destination — see queueFilters.
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  // Doctors or laboratories (0048): a lab buying from this one orders through
  // a buying profile, so it is a "doctor" row with buyer_lab_id set.
  const [customerKind, setCustomerKind] = useState<CustomerKind>('all');
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
          'id, order_code, doctor_id, buyer_lab_id, patient_reference, status, generated_total, final_total, requested_due_date, confirmed_due_date, requested_due_time, confirmed_due_time, created_at, service_snapshot, doctor_snapshot, has_unreviewed_edits, ' +
            `${DESTINATION_SELECT}, ` +
            'lab_services(name), patients(first_name, last_name), order_clarifications(answered_at, resolved_by_edit_at), ' +
            ORDER_TRASH_EMBED,
        )
        // Not left to RLS: from 0048 the lab's owner also reads its own
        // purchases from other labs (as their buying profile), and those
        // belong under "My orders to labs", never in this queue.
        .eq('lab_id', labId!)
        // Not the ones this lab deleted (0054), in its trash or gone. Server-
        // side, so every count, tile and page below is over the same rows.
        .is('order_trash', null)
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
  // A buying lab is one "doctor" (its buying profile) under its own name;
  // the caption says it is a laboratory, and type-to-narrow matches it too.
  const doctorOptions = useMemo(
    () =>
      doctorOptionsFrom(orders).map((o) =>
        o.isLab ? { ...o, detail: t('customer.fromLab') } : o,
      ),
    [orders, t],
  );
  const destinationOptions = useMemo(() => destinationOptionsFrom(orders), [orders]);

  const hasFilters = !!(
    search ||
    quick !== 'all' ||
    statuses.length > 0 ||
    dateFrom?.isValid() ||
    dateTo?.isValid() ||
    noFinalPrice ||
    doctorId ||
    destination ||
    customerKind !== 'all'
  );

  const filtered = useMemo(() => {
    // Quick pill, statuses, due dates and the no-final-price chip go through
    // the same function the lab dashboard counts with (orderPresets), so the
    // rows a dashboard number opens onto are the rows it counted.
    const queueFilter = {
      quick,
      statuses,
      dateFrom: dateFrom?.isValid() ? dateFrom.format('YYYY-MM-DD') : null,
      dateTo: dateTo?.isValid() ? dateTo.format('YYYY-MM-DD') : null,
      noFinalPrice,
    };
    let result = orders.filter((row) => matchesQueueFilter(row, queueFilter));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((row) => {
        const ds = row.doctor_snapshot ?? {};
        const doctor = [ds.first_name, ds.last_name].filter(Boolean).join(' ').toLowerCase();
        // The buying lab's case reference stands in for a missing patient.
        const patient = [
          row.patients ? `${row.patients.first_name} ${row.patients.last_name}` : '',
          row.patient_reference ?? '',
        ]
          .join(' ')
          .toLowerCase();
        const service = (row.lab_services?.name ?? row.service_snapshot?.name ?? '').toLowerCase();
        return (
          row.order_code.toLowerCase().includes(q) ||
          doctor.includes(q) ||
          patient.includes(q) ||
          service.includes(q)
        );
      });
    }
    if (doctorId) {
      result = result.filter((row) => row.doctor_id === doctorId);
    }
    if (destination) {
      result = result.filter((row) => destinationKeyOf(row) === destination);
    }
    if (customerKind !== 'all') {
      result = result.filter((row) => matchesCustomerKind(row, customerKind));
    }
    // The lab's chosen order — newest first unless it picked otherwise. Every
    // comparator is total, so a background refetch never reshuffles equal rows.
    return [...result].sort(orderComparator(sort));
  }, [
    orders,
    quick,
    search,
    statuses,
    dateFrom,
    dateTo,
    noFinalPrice,
    doctorId,
    destination,
    customerKind,
    sort,
  ]);

  const quickCounts = useMemo(
    () =>
      Object.fromEntries(
        QUICK.map((q) => [q, orders.filter((row) => matchesQuick(row, q)).length]),
      ) as Record<Quick, number>,
    [orders],
  );

  const stats = useMemo(() => {
    const dates = queueDates();
    const open = orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status));
    return {
      // Counted with the presets the tiles apply (orderPresets), so the number
      // and the rows it opens onto cannot disagree.
      dueThisWeek: orders.filter((o) => matchesPreset(o, 'dueThisWeek', dates)).length,
      edits: orders.filter((o) => o.has_unreviewed_edits).length,
      inProgress: orders.filter((o) => matchesPreset(o, 'inProgress', dates)).length,
      ready: open.filter((o) => o.status === 'READY_FOR_DELIVERY').length,
    };
  }, [orders]);

  // For the rows' overdue pill: the same rule the "Overdue" tile counts by.
  const rowDates = queueDates();

  const finishedCount = useMemo(() => orders.filter((o) => canTrash(o.status)).length, [orders]);
  const selectableIds = useMemo(
    () => filtered.filter((o) => canTrash(o.status)).map((o) => o.id),
    [filtered],
  );
  const columns = selection.active ? [SELECT_COLUMN, ...COLUMNS] : COLUMNS;

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
  }, [search, quick, statuses, fromKey, toKey, noFinalPrice, doctorId, destination, customerKind, sort]);

  const clearFilters = () => {
    setSearch('');
    setQuick('all');
    setStatuses([]);
    setDateFrom(null);
    setDateTo(null);
    setNoFinalPrice(false);
    setDoctorId(null);
    setDestination(null);
    setCustomerKind('all');
  };

  // A preset (orderPresets) from a clean slate, so the rows match the number
  // that was clicked — this page's tiles and the lab dashboard's squares
  // alike. setPage too: re-applying the same preset changes no filter, so the
  // reset effect would not fire.
  const applyPreset = (preset: OrderPreset) => {
    const f = presetFilter(preset);
    clearFilters();
    setQuick(f.quick);
    setStatuses([...f.statuses]);
    setDateFrom(f.dateFrom ? dayjs(f.dateFrom) : null);
    setDateTo(f.dateTo ? dayjs(f.dateTo) : null);
    setNoFinalPrice(f.noFinalPrice);
    if (f.advancedOpen) setAdvancedOpen(true);
    setPage(1);
  };
  const showDueThisWeek = () => applyPreset('dueThisWeek');
  const showInProgress = () => applyPreset('inProgress');

  // The lab dashboard hands a preset over in router state. Keyed on the
  // location, not read once on mount: arriving again while already here (or
  // from a second square after Back) has to apply too. The state is cleared
  // once applied, so a refresh or Back does not re-apply it over filters the
  // lab has changed since.
  useEffect(() => {
    const preset = (location.state as { preset?: unknown } | null)?.preset;
    if (!isOrderPreset(preset)) return;
    applyPreset(preset);
    navigate(location.pathname, { replace: true, state: null });
    // Only a new navigation should apply a preset; applyPreset and navigate
    // are stable in what they do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
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
            label={statusLabel('IN_PROGRESS', tc, 'lab')}
            onClick={stats.inProgress > 0 ? showInProgress : undefined}
          />
          <StatTile
            icon="package_2"
            tone="success"
            value={stats.ready}
            label={statusLabel('READY_FOR_DELIVERY', tc, 'lab')}
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
              {/* Bulk "Move to trash" (0054), on finished orders only. */}
              {finishedCount > 0 && (
                <ChoicePill
                  selected={selection.active}
                  onClick={selection.active ? selection.stop : selection.start}
                >
                  <Icon name="checklist" size={15} />
                  {tc('trash.select.start')}
                </ChoicePill>
              )}
            </PillRow>

            {/* Preset-only filters, shown with the active filters so the lab
                can see why rows are missing and take the filter off. */}
            {noFinalPrice && (
              <Stack direction="row" spacing={1} sx={{ mt: 1.75 }}>
                <Chip
                  color="primary"
                  size="small"
                  label={t('ordersDashboard.filters.noFinalPrice')}
                  onDelete={() => setNoFinalPrice(false)}
                />
              </Stack>
            )}

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
                      sel.length === 0 ? '' : sel.map((s) => statusLabel(s, tc, 'lab')).join(', ')
                    }
                  >
                    {FILTERABLE_STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>
                        <Checkbox checked={statuses.includes(s)} size="small" />
                        <ListItemText primary={statusLabel(s, tc, 'lab')} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>{t('ordersDashboard.filters.customer')}</InputLabel>
                  <Select
                    value={customerKind}
                    onChange={(e) => setCustomerKind(e.target.value as CustomerKind)}
                    input={<OutlinedInput label={t('ordersDashboard.filters.customer')} />}
                  >
                    {CUSTOMER_KINDS.map((k) => (
                      <MenuItem key={k} value={k}>
                        {t(`ordersDashboard.filters.customerKind.${k}`)}
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
            columns={columns.map((c) =>
              c.key === 'go' || c.key === 'select'
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
              const patientName = patientLabel(row);
              const fromLab = isLabPurchase(row);
              const serviceName = row.lab_services?.name ?? row.service_snapshot?.name ?? '';
              const total = row.final_total ?? row.generated_total;
              const dueRaw = dueDateOf(row);
              const daysOut = dueRaw ? dayjs(dueRaw).diff(dayjs(), 'day') : null;
              // Red once the date has passed on a case still open: exactly the
              // rows the "Overdue" preset finds, so the colour and the count
              // agree. A closed case has no deadline left to miss.
              const overdue = matchesPreset(row, 'overdue', rowDates);
              const closed = (CLOSED_STATUSES as readonly OrderStatus[]).includes(row.status);
              const dueTone = overdue
                ? 'danger'
                : daysOut == null || closed
                  ? 'neutral'
                  : daysOut <= 1
                    ? 'warning'
                    : daysOut <= 4
                      ? 'info'
                      : 'neutral';

              const answered = isAnswered(row);
              const place = destinationLabelOf(row);
              const pickable = canTrash(row.status);
              const picked = selection.active && selection.ids.has(row.id);

              return (
                <DataRow
                  key={row.id}
                  columns={columns}
                  highlight={picked || row.has_unreviewed_edits || answered}
                  // In select mode a finished row toggles; the rest wait.
                  onClick={
                    !selection.active
                      ? () => navigate(`/lab/orders/${row.id}`)
                      : pickable
                        ? () => selection.toggle(row.id)
                        : undefined
                  }
                >
                  {selection.active && (
                    <Checkbox
                      checked={picked}
                      disabled={!pickable}
                      size="small"
                      tabIndex={-1}
                      disableRipple
                      inputProps={{ 'aria-label': row.order_code }}
                      sx={{ p: 0, pointerEvents: 'none' }}
                    />
                  )}
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
                    {/* On its own line, not beside the name: the column is
                        narrow at 1280px and a lab's name is long. */}
                    {fromLab && (
                      <Box sx={{ mt: 0.375 }}>
                        <FromLabBadge />
                      </Box>
                    )}
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
                      title={overdue ? t('dashboard.overdue') : undefined}
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
                            {statusLabel(v as OrderStatus, tc, 'lab')}
                          </Typography>
                        </Stack>
                      )}
                    >
                      {LAB_SELECTABLE_STATUSES.map((s) => (
                        <MenuItem key={s} value={s}>
                          {statusLabel(s, tc, 'lab')}
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
        <TrashSelectionBar
          selection={selection}
          side="LAB"
          selectableIds={selectableIds}
          keeperOf={(ids) => labSideKeeper(orders.filter((o) => ids.includes(o.id)))}
          onTrashed={trashToast.show}
        />
        {!isLoading && <TrashLink scope={labId ? { side: 'LAB', labId } : null} to="/lab/trash" />}
      </Stack>
      {trashToast.node}

      <ClarificationAskDialog
        orderId={askOrderId}
        kind={askKind}
        open={!!askOrderId}
        onClose={() => setAskOrderId(null)}
      />
    </>
  );
}
