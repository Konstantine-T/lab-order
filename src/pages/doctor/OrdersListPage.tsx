import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import {
  ChoicePill,
  Icon,
  PageHeader,
  PillRow,
  ProgressBar,
  StatusPill,
} from '@/components/design';
import { formatGEL } from '@/utils/pricing';
import { OrderRowCard } from '@/features/orders/OrderRowCard';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import { OrdersPaginator } from '@/features/orders/OrdersPaginator';
import { ORDER_PIPELINE, pipelineIndex } from '@/features/orders/pipeline';
import { OrderCompletionActions } from '@/features/orders/completion/OrderCompletionActions';
import { canComplete } from '@/types/database';
import type { OrderRow, OrderStatus } from '@/types/database';
import {
  loadDraft,
  clearDraft,
  checkDraftBrokenness,
} from '@/features/doctor/orderCreate/draftStorage';
import { useContinueProject } from '@/features/doctor/orderCreate/useContinueProject';

const ALL_STATUSES: readonly OrderStatus[] = [
  'SUBMITTED',
  'RECEIVED',
  'NEEDS_CLARIFICATION',
  'IN_PROGRESS',
  'READY_FOR_DELIVERY',
  'SENT_TO_CLINIC',
  'RECEIVED_BY_CLINIC',
  'TRY_IN_PHASE',
  'COMPLETED',
  'CANCELLED',
];

/** The mockups' four quick filters, above the finer status/date controls. */
const QUICK = ['all', 'active', 'needsAction', 'completed'] as const;
type Quick = (typeof QUICK)[number];

/** Statuses where the ball is in the doctor's court. */
// Statuses where the case is waiting on the doctor, not on the lab.
// RECEIVED_BY_CLINIC is here because closing a case is the doctor's call
// (0022): the work is sitting at the clinic and nothing moves until the
// doctor confirms it seated.
const NEEDS_ACTION: readonly OrderStatus[] = [
  'NEEDS_CLARIFICATION',
  'TRY_IN_PHASE',
  'RECEIVED_BY_CLINIC',
];

type Row = OrderRow & {
  patients: { first_name: string; last_name: string } | null;
  labs: { public_name: string } | null;
  lab_services: { name: string } | null;
  service_snapshot: { name?: string } | null;
};

const matchesQuick = (row: Row, quick: Quick) => {
  if (quick === 'all') return true;
  if (quick === 'completed') return row.status === 'COMPLETED';
  if (quick === 'needsAction') return NEEDS_ACTION.includes(row.status as OrderStatus);
  return row.status !== 'COMPLETED' && row.status !== 'CANCELLED';
};

export function OrdersListPage() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const doctorId = user?.doctor_profile?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const continueProject = useContinueProject();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<Quick>('all');
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [draftSeen, setDraftSeen] = useState(false);

  const draftQuery = useQuery({
    queryKey: ['doctor-draft', doctorId],
    enabled: !!doctorId,
    queryFn: () => loadDraft(doctorId!),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const draft = draftQuery.data ?? null;

  // Only open the modal once we know the DB actually has a draft — not from
  // a stale cache hit. refetchOnMount:'always' + staleTime:0 means isFetched
  // flips to true only after a fresh network round-trip on each mount, so a
  // draft that was deleted after submit will return null here.
  useEffect(() => {
    if (draftQuery.isFetched && draftQuery.data && !draftSeen) {
      setDraftModalOpen(true);
      setDraftSeen(true);
    }
  }, [draftQuery.isFetched, draftQuery.data, draftSeen]);

  const { data: draftBroken = null } = useQuery({
    queryKey: ['draft-broken-check', draft?.state.lab_id, draft?.state.lab_service_id],
    enabled: !!draft,
    queryFn: async () => {
      const [labRes, svcRes] = await Promise.all([
        supabase
          .from('labs')
          .select('is_active, approval_status')
          .eq('id', draft!.state.lab_id)
          .maybeSingle(),
        supabase
          .from('lab_services')
          .select('is_active, lab_forms!lab_services_linked_form_fk(status)')
          .eq('id', draft!.state.lab_service_id)
          .maybeSingle(),
      ]);
      const svc = svcRes.data as { is_active: boolean; lab_forms: { status: string } | null } | null;
      return checkDraftBrokenness(labRes.data, svc, svc?.lab_forms ?? null);
    },
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['doctor-orders', doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_code, status, payment_status, generated_total, final_total, requested_due_date, confirmed_due_date, created_at, service_snapshot, lab_id, patient_id, ' +
            'patients(first_name, last_name), labs(public_name), lab_services(name)',
        )
        .eq('doctor_id', doctorId!)
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
        const patient = row.patients
          ? `${row.patients.first_name} ${row.patients.last_name}`.toLowerCase()
          : '';
        const service = (
          row.lab_services?.name ??
          row.service_snapshot?.name ??
          ''
        ).toLowerCase();
        const lab = (row.labs?.public_name ?? '').toLowerCase();
        return (
          row.order_code.toLowerCase().includes(q) ||
          patient.includes(q) ||
          service.includes(q) ||
          lab.includes(q)
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

  const handleDraftContinue = () => {
    if (!draft) return;
    setDraftModalOpen(false);
    navigate(`/doctor/orders/new?lab=${draft.state.lab_id}&service=${draft.state.lab_service_id}`);
  };

  const handleDraftDiscard = async () => {
    if (doctorId) await clearDraft(doctorId);
    queryClient.setQueryData(['doctor-draft', doctorId], null);
    setDraftModalOpen(false);
  };

  const draftPatientName = draft
    ? `${draft.state.patient.first_name} ${draft.state.patient.last_name}`.trim() || '—'
    : '';

  return (
    <>
      <PageHeader
        title={t('orders.title')}
        subtitle={t('orders.subtitle')}
        actions={
          <>
            <TextField
              placeholder={t('orders.filters.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              sx={{ width: { sm: 250 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Icon name="search" size={18} sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="contained"
              component={RouterLink}
              to="/doctor/marketplace"
              startIcon={<Icon name="add" size={17} />}
            >
              {t('orders.newOrder')}
            </Button>
          </>
        }
      />

      {/* Draft resume modal */}
      <Dialog open={draftModalOpen} onClose={() => setDraftModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {draftBroken?.broken ? t('orders.draft.titleBroken') : t('orders.draft.title')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            <Stack spacing={0.5}>
              <Typography variant="subtitle1">{draftPatientName}</Typography>
              {draft && (
                <Typography variant="body1" color="text.secondary">
                  {[draft.labName, draft.serviceName].filter(Boolean).join(' · ')}
                </Typography>
              )}
            </Stack>
            {draftBroken?.broken && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {t('orders.draft.brokenAlert')}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDraftDiscard} color="inherit">{t('orders.draft.discard')}</Button>
          {draftBroken?.broken ? (
            <Button variant="outlined" onClick={handleDraftContinue}>
              {t('orders.draft.viewBroken')}
            </Button>
          ) : (
            <Button variant="contained" onClick={handleDraftContinue}>
              {t('orders.draft.continue')}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Stack spacing={2}>
        {/* Unfinished-draft banner — the mockups' brand-tinted resume strip. */}
        {draft && !isLoading && (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ sm: 'center' }}
            spacing={1.5}
            sx={(theme) => ({
              px: 2.25,
              py: 1.625,
              borderRadius: '14px',
              border: 1,
              borderColor: 'primary.main',
              bgcolor:
                theme.palette.mode === 'light'
                  ? 'rgba(146,146,255,0.09)'
                  : 'rgba(146,146,255,0.14)',
            })}
          >
            <Icon name="draft" size={21} sx={{ color: 'primary.dark' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                {t('orders.draft.bannerTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {[draftPatientName, draft.labName, draft.serviceName]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
            </Box>
            {draftBroken?.broken && (
              <StatusPill tone="warning">{t('orders.draft.brokenTooltip')}</StatusPill>
            )}
            <Button size="small" variant="contained" onClick={handleDraftContinue}>
              {t('orders.draft.resume')}
            </Button>
            <Button size="small" color="inherit" onClick={handleDraftDiscard}>
              {t('orders.draft.discard')}
            </Button>
          </Stack>
        )}

        {/* Quick filters + the finer controls behind a toggle. */}
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
                  {t(`orders.quick.${q}`)}
                </ChoicePill>
              ))}
              <ChoicePill
                selected={advancedOpen}
                onClick={() => setAdvancedOpen((v) => !v)}
                sx={{ ml: 'auto' }}
              >
                <Icon name="tune" size={15} />
                {t('orders.moreFilters')}
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
                  <InputLabel>{t('orders.filters.status')}</InputLabel>
                  <Select
                    multiple
                    value={statuses}
                    onChange={(e) => setStatuses(e.target.value as OrderStatus[])}
                    input={<OutlinedInput label={t('orders.filters.status')} />}
                    renderValue={(sel) =>
                      sel.length === 0 ? '' : sel.map((s) => tc(`orderStatus.${s}`)).join(', ')
                    }
                  >
                    {ALL_STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>
                        <Checkbox checked={statuses.includes(s)} size="small" />
                        <ListItemText primary={tc(`orderStatus.${s}`)} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <DatePicker
                  label={t('orders.filters.from')}
                  value={dateFrom}
                  onChange={(d) => setDateFrom(d)}
                  format="YYYY-MM-DD"
                  slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
                />
                <DatePicker
                  label={t('orders.filters.to')}
                  value={dateTo}
                  onChange={(d) => setDateTo(d)}
                  format="YYYY-MM-DD"
                  slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
                />
                {hasFilters && (
                  <Button size="small" onClick={clearFilters} sx={{ whiteSpace: 'nowrap' }}>
                    {t('orders.filters.clear')}
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
          <OrdersEmptyState
            title={t('orders.empty')}
            action={
              <Button
                startIcon={<Icon name="add" size={17} />}
                variant="contained"
                component={RouterLink}
                to="/doctor/marketplace"
              >
                {t('orders.newOrder')}
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <OrdersEmptyState icon="filter_alt_off" title={t('orders.filters.noResults')} />
        ) : (
          <Stack spacing={2}>
            <Stack spacing={1.25}>
              {visible.map((row) => {
                const patientName = row.patients
                  ? `${row.patients.first_name} ${row.patients.last_name}`
                  : '—';
                const serviceName = row.lab_services?.name ?? row.service_snapshot?.name ?? '';
                const labName = row.labs?.public_name ?? '';
                const hasDiscount =
                  row.final_total != null &&
                  row.generated_total != null &&
                  row.final_total < row.generated_total;
                const total = row.final_total ?? row.generated_total;
                const dueRaw = row.confirmed_due_date ?? row.requested_due_date;
                const due = dueRaw ? dayjs(dueRaw).format('MMM D') : undefined;
                const overdue =
                  !!dueRaw &&
                  row.status !== 'COMPLETED' &&
                  row.status !== 'CANCELLED' &&
                  dayjs(dueRaw).diff(dayjs(), 'day') <= 1;
                const step = pipelineIndex(row.status as OrderStatus);
                const needsAction = NEEDS_ACTION.includes(row.status as OrderStatus);
                const next = step != null ? ORDER_PIPELINE[step + 1] : undefined;

                return (
                  <OrderRowCard
                    key={row.id}
                    code={row.order_code}
                    primary={patientName}
                    secondary={[serviceName, labName].filter(Boolean).join(' · ')}
                    status={<OrderStatusChip status={row.status} />}
                    paymentStatus={<PaymentStatusChip status={row.payment_status} />}
                    total={total != null ? formatGEL(total) : '—'}
                    originalTotal={hasDiscount ? formatGEL(row.generated_total!) : undefined}
                    dueDate={due}
                    dueUrgent={overdue}
                    avatarText={patientName}
                    highlight={needsAction}
                    flag={
                      needsAction ? (
                        <StatusPill tone="warning">{tc(`orderStatus.${row.status}`)}</StatusPill>
                      ) : undefined
                    }
                    onClick={() => navigate(`/doctor/orders/${row.id}`)}
                    progress={
                      step == null ? undefined : (
                        <ProgressBar
                          total={ORDER_PIPELINE.length}
                          current={step}
                          complete={row.status === 'COMPLETED'}
                          caption={
                            row.status === 'COMPLETED'
                              ? t('orders.pipelineDone')
                              : next
                                ? t('orders.pipelineNext', {
                                    current: tc(`orderStatus.${ORDER_PIPELINE[step]}`),
                                    next: tc(`orderStatus.${next}`),
                                  })
                                : tc(`orderStatus.${ORDER_PIPELINE[step]}`)
                          }
                        />
                      )
                    }
                    footer={
                      row.status === 'CANCELLED' ? undefined : (
                        <Stack direction="row" spacing={1} sx={{ px: 2.5, py: 1.25 }}>
                          {row.status !== 'COMPLETED' && (
                            <Button
                              size="small"
                              startIcon={<Icon name="edit" size={16} />}
                              onClick={() => navigate(`/doctor/orders/${row.id}/edit`)}
                            >
                              {t('orders.editButton')}
                            </Button>
                          )}
                          {canComplete(row.status) && (
                            <OrderCompletionActions orderId={row.id} status={row.status} />
                          )}
                          {row.status === 'COMPLETED' && (
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<Icon name="add" size={16} />}
                              onClick={() =>
                                continueProject.start(row.lab_id, row.patient_id, row.id)
                              }
                            >
                              {t('orders.continueProject')}
                            </Button>
                          )}
                        </Stack>
                      )
                    }
                  />
                );
              })}
            </Stack>
            <OrdersPaginator
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </Stack>
        )}
      </Stack>
      {continueProject.modal}
    </>
  );
}
