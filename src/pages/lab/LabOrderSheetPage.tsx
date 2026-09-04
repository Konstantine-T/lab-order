import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DatePicker, TimePicker } from '@mui/x-date-pickers';
import { formatDueWindow } from '@/features/orders/orderDates';
import dayjs, { type Dayjs } from 'dayjs';
import { supabase } from '@/lib/supabase';
import { formatGEL } from '@/utils/pricing';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import { useAuth } from '@/auth/AuthProvider';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { OrderFilesField } from '@/features/orders/orderFiles/OrderFilesField';
import {
  Callout,
  ChoicePill,
  FactCell,
  FieldLabel,
  Icon,
  PageHeader,
  PillRow,
  SectionCard,
  SplitLayout,
  StatusPill,
} from '@/components/design';
import { tone } from '@/theme/tokens';
import { recordPayment } from '@/features/lab/finances/financeApi';
import { OrderForm } from '@/features/orderForms/OrderForm';
import {
  diffStates,
  stateFromLive,
  stateFromSnapshot,
  type EditState,
} from '@/features/lab/orderEdits/diff';
import { OrderAnswersDiff } from '@/features/lab/orderEdits/OrderAnswersDiff';
import { OrderLineage } from '@/features/orders/OrderLineage';
import { ClarificationPanel } from '@/features/orders/clarifications/ClarificationPanel';
import { ClarificationAskDialog } from '@/features/orders/clarifications/ClarificationAskDialog';
import {
  clarificationsKey,
  fetchClarifications,
} from '@/features/orders/clarifications/clarificationsApi';
import { OrderTeamSection } from '@/features/lab/staff/OrderTeamSection';
import type {
  LabFormVersionRow,
  OrderAnswerRow,
  OrderEditRow,
  OrderRow,
  OrderStatus,
} from '@/types/database';
import { LAB_SELECTABLE_STATUSES } from '@/types/database';

type DetailRow = OrderRow;

export function LabOrderSheetPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const qc = useQueryClient();

  const [finalPrice, setFinalPrice] = useState<string>('');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [confirmedDue, setConfirmedDue] = useState<string>('');
  const [confirmedTime, setConfirmedTime] = useState<string>('');
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | ''>('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Validation belongs next to the field that failed it. The top-of-page Alert
  // is for mutation failures, which are page-level events; on a long sheet the
  // lab is looking at the rail and would never see a message up there.
  const [priceError, setPriceError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [selectedEditIndex, setSelectedEditIndex] = useState(0);

  const { data: order, isLoading } = useQuery({
    queryKey: ['lab-order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId!)
        .maybeSingle();
      if (error) throw error;
      return data as DetailRow | null;
    },
  });

  // Edit history, newest first. Drives the diff highlight + history dropdown.
  const { data: edits = [] } = useQuery({
    queryKey: ['order-edits', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_edits')
        .select('*')
        .eq('order_id', orderId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderEditRow[];
    },
  });

  const { data: answers = [] } = useQuery({
    queryKey: ['order-answers', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_answers')
        .select('*')
        .eq('order_id', orderId!);
      if (error) throw error;
      return (data ?? []) as OrderAnswerRow[];
    },
  });

  // Shares its cache with the panel below; read here only to know whether a
  // question is still waiting on the doctor.
  const { data: clarifications = [] } = useQuery({
    queryKey: clarificationsKey(orderId ?? ''),
    enabled: !!orderId,
    queryFn: () => fetchClarifications(orderId!),
  });
  // Matches the partial unique index and both ask RPCs. Checking `answered_at`
  // alone left this true forever after one edit request — 0030 closes those
  // with `resolved_by_edit_at` and never touches the answer columns — so the
  // lab could never ask anything about that order again.
  const hasOpenClarification = clarifications.some(
    (c) => c.answered_at === null && c.resolved_by_edit_at === null,
  );

  const { data: version } = useQuery({
    queryKey: ['order-version', order?.lab_form_version_id],
    enabled: !!order?.lab_form_version_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_form_versions')
        .select('*')
        .eq('id', order!.lab_form_version_id)
        .maybeSingle();
      if (error) throw error;
      return data as LabFormVersionRow | null;
    },
  });

  // Seed the editable fields once per order, not on every fetch. The effect
  // used to depend on the whole `order` object, so any refetch of ['lab-order']
  // handed it a fresh reference and reset all four fields to the stored values
  // — wiping whatever the lab was halfway through typing. markReviewed fires
  // exactly that refetch on mount for any order with unreviewed edits, so on
  // those orders a price would vanish as it was being entered. Same ref-guard
  // shape as clearedRef below, for the same reason.
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!order || hydratedRef.current === order.id) return;
    hydratedRef.current = order.id;
    setFinalPrice(order.final_total?.toString() ?? '');
    setPaidAmount(order.paid_total?.toString() ?? '0');
    setConfirmedDue(order.confirmed_due_date ?? '');
    setConfirmedTime(order.confirmed_due_time?.slice(0, 5) ?? '');
    setPendingStatus(order.status);
  }, [order]);

  const update = useMutation({
    mutationFn: async (patch: Partial<OrderRow>) => {
      if (!orderId) return;
      const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      setSuccess(t('orderSheet.saved'));
      qc.invalidateQueries({ queryKey: ['lab-order', orderId] });
      qc.invalidateQueries({ queryKey: ['lab-orders'] });
    },
    onError: () => setError(t('orderSheet.saveFailed')),
  });

  const recordPay = useMutation({
    mutationFn: async (amount: number) => {
      if (!orderId) return;
      await recordPayment(orderId, amount);
    },
    onSuccess: () => {
      setSuccess(t('orderSheet.saved'));
      qc.invalidateQueries({ queryKey: ['lab-order', orderId] });
      qc.invalidateQueries({ queryKey: ['lab-orders'] });
      qc.invalidateQueries({ queryKey: ['lab-receivables-by-customer'] });
      qc.invalidateQueries({ queryKey: ['lab-receivables-list'] });
    },
    onError: () => setError(t('orderSheet.saveFailed')),
  });

  const cancel = useMutation({
    mutationFn: async (reason: string) => {
      if (!orderId) return;
      const { error } = await supabase
        .from('orders')
        .update({ status: 'CANCELLED', cancellation_reason: reason })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      setCancelOpen(false);
      setCancelReason('');
      setSuccess(t('orderSheet.cancelModal.success'));
      qc.invalidateQueries({ queryKey: ['lab-order', orderId] });
      qc.invalidateQueries({ queryKey: ['lab-orders'] });
    },
    onError: () => setError(t('orderSheet.saveFailed')),
  });

  // Opening the sheet counts as the lab reviewing the edit, so clear the
  // attention flag. The order stays in the edited list (that keys off
  // edit_count, not this flag) and the full diff/history stays visible here —
  // only the list highlight + needs-attention count respond to the flag.
  const markReviewed = useMutation({
    mutationFn: async () => {
      if (!orderId) return;
      const { error } = await supabase
        .from('orders')
        .update({ has_unreviewed_edits: false })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lab-order', orderId] });
      qc.invalidateQueries({ queryKey: ['lab-orders'] });
      qc.invalidateQueries({ queryKey: ['lab-edited-orders'] });
      qc.invalidateQueries({ queryKey: ['lab-unreviewed-edits-count'] });
    },
    // Best-effort: if clearing fails the highlight just stays, no need to nag.
  });

  // Fire the clear once per loaded order. Guard with a ref because the success
  // handler refetches ['lab-order'], which would otherwise re-trigger this.
  /**
   * Read a money field the way a person types one.
   *
   * Georgian and Russian keyboards produce a decimal comma, and Number('656,50')
   * is NaN — which used to travel all the way to Postgres as final_total: NaN.
   * Returns null for anything that isn't a finite number, so the caller can
   * refuse it instead of posting it.
   */
  const parseAmount = (raw: string): number | null => {
    const n = Number(raw.replace(',', '.').trim());
    return Number.isFinite(n) ? n : null;
  };

  const clearedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!orderId || !order?.has_unreviewed_edits) return;
    if (clearedRef.current === orderId) return;
    clearedRef.current = orderId;
    markReviewed.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, order?.has_unreviewed_edits]);

  // Build the before/after diff for the selected edit. states (newest→oldest)
  // = [liveState, edits[0].snapshot, edits[1].snapshot, …]; the diff for edit i
  // is states[i] (after) vs states[i+1] (before = that edit's snapshot).
  const editReview = useMemo(() => {
    if (!order || edits.length === 0) return null;
    const liveAnswers: Record<string, unknown> = {};
    for (const a of answers) liveAnswers[a.field_code] = a.answer_json;
    const states: EditState[] = [
      stateFromLive(order, liveAnswers),
      ...edits.map((e) => stateFromSnapshot(e.snapshot_json)),
    ];
    const idx = Math.min(selectedEditIndex, edits.length - 1);
    const after = states[idx];
    const before = states[idx + 1];
    return { idx, before, after, diff: diffStates(before, after) };
  }, [order, answers, edits, selectedEditIndex]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!order) return <Alert severity="error">{tc('errors.notFound')}</Alert>;

  const isTerminal = order.status === 'COMPLETED' || order.status === 'CANCELLED';

  const answersMap: Record<string, unknown> = {};
  for (const a of answers) answersMap[a.field_code] = a.answer_json;

  const doctor = order.doctor_snapshot ?? {};
  const doctorFullName = [doctor.first_name, doctor.last_name].filter(Boolean).join(' ');
  const serviceSnap = order.service_snapshot as { name?: string };
  const locSnap = order.work_location_snapshot as {
    clinic_name?: string;
    branch_name?: string;
    city?: string;
  };
  const statusDirty = !!pendingStatus && pendingStatus !== order.status;
  // One open question at a time (the DB enforces it too) — until the doctor
  // answers, there is nothing new to ask.
  // Both asks write the same row and the DB allows one open per order, so
  // either kind is blocked while one is still open.
  const asksDoctor =
    pendingStatus === 'NEEDS_CLARIFICATION' || pendingStatus === 'NEEDS_DOCTOR_INPUT';
  const askBlocked = asksDoctor && hasOpenClarification;

  return (
    <>
      <PageHeader
        backTo="/lab/orders"
        title={order.order_code}
        subtitle={t('orderSheet.createdOn', {
          date: dayjs(order.created_at).format('YYYY-MM-DD HH:mm'),
        })}
        chips={
          <>
            <OrderStatusChip status={order.status} />
            {edits.length > 0 && (
              <StatusPill tone="warning">
                <Icon name="difference" size={14} />
                {t('orderSheet.editedTimes', { n: edits.length })}
              </StatusPill>
            )}
          </>
        }
      />

      <SplitLayout
        rail={
          <>
            {/* Status switcher */}
            <SectionCard title={t('orderSheet.statusTitle')} meta={t('orderSheet.statusHelp')}>
              <PillRow>
                {LAB_SELECTABLE_STATUSES.map((s) => (
                  <ChoicePill
                    key={s}
                    selected={(pendingStatus || order.status) === s}
                    onClick={() => setPendingStatus(s)}
                    disabled={isTerminal}
                  >
                    {tc(`orderStatus.${s}`)}
                  </ChoicePill>
                ))}
              </PillRow>
              {/* COMPLETED is no longer a pill (0022) — say so, rather than
                  leaving the lab hunting for a status that used to be here. */}
              <Callout tone="info" sx={{ mt: 1.75 }}>
                {t('orderSheet.statusCompletionNote')}
              </Callout>
              {/* Asking again while the first question is still unanswered would
                  hit the one-open-per-order index, so say so here instead. */}
              {askBlocked && (
                <Callout tone="warning" sx={{ mt: 1.75 }}>
                  {t('orderSheet.clarification.alreadyOpenHint')}
                </Callout>
              )}
              <Stack direction="row" spacing={1} sx={{ mt: 1.75 }}>
                {!isTerminal && (
                  <Button
                    variant="outlined"
                    color="error"
                    fullWidth
                    size="small"
                    onClick={() => setCancelOpen(true)}
                  >
                    {t('orderSheet.cancelOrder')}
                  </Button>
                )}
                <Button
                  variant="contained"
                  fullWidth
                  size="small"
                  disabled={update.isPending || !statusDirty || isTerminal || askBlocked}
                  onClick={() => {
                    if (!pendingStatus) return;
                    // Neither "needs clarification" nor "needs doctor's input"
                    // is a status you can just save — each only means something
                    // with the question attached.
                    if (asksDoctor) {
                      setClarifyOpen(true);
                      return;
                    }
                    update.mutate({ status: pendingStatus });
                  }}
                >
                  {statusDirty ? t('orderSheet.saveStatus') : t('orderSheet.statusSaved')}
                </Button>
              </Stack>
            </SectionCard>

            {/* Final price + confirmed due date */}
            <SectionCard>
              <Stack spacing={2.25}>
                <Box>
                  <Typography sx={{ fontSize: '0.84375rem', fontWeight: 700, mb: 1 }}>
                    {t('orderSheet.finalPriceLabel')}
                  </Typography>
                  {/* Stacked, not side by side: this rail is 316px wide and a
                      row leaves the input whatever the button's label doesn't
                      take. A Georgian label ate it down to a sliver. The status
                      card above already stacks a full-width button under its
                      control, so this matches rather than invents. */}
                  <Stack spacing={1}>
                    <TextField
                      type="number"
                      size="small"
                      value={finalPrice}
                      onChange={(e) => {
                        setFinalPrice(e.target.value);
                        setPriceError(null);
                      }}
                      fullWidth
                      error={!!priceError}
                      helperText={priceError ?? undefined}
                      inputProps={{ min: 0, step: '0.01' }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Typography sx={{ color: 'text.secondary' }}>₾</Typography>
                          </InputAdornment>
                        ),
                      }}
                    />
                    <Button
                      variant="outlined"
                      fullWidth
                      size="small"
                      onClick={() => {
                        setPriceError(null);
                        // Clearing the price is a legitimate action.
                        if (finalPrice.trim() === '') {
                          update.mutate({ final_total: null });
                          return;
                        }
                        const amount = parseAmount(finalPrice);
                        if (amount === null || amount < 0) {
                          setPriceError(t('orderSheet.finalPriceInvalid'));
                          return;
                        }
                        if (order.generated_total != null) {
                          const floor = order.generated_total * 0.5;
                          if (amount < floor) {
                            setPriceError(
                              t('orderSheet.finalPriceTooLow', { min: formatGEL(floor) }),
                            );
                            return;
                          }
                        }
                        update.mutate({ final_total: amount });
                      }}
                      disabled={update.isPending}
                    >
                      {t('orderSheet.setFinalPrice')}
                    </Button>
                  </Stack>
                  {order.generated_total != null && !priceError && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.625, display: 'block' }}>
                      {t('orderSheet.finalPriceMin', {
                        min: formatGEL(order.generated_total * 0.5),
                      })}
                    </Typography>
                  )}
                </Box>

                <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
                  <Typography sx={{ fontSize: '0.84375rem', fontWeight: 700 }}>
                    {t('orderSheet.confirmedDueDate')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {t('orderSheet.dueDate')}:{' '}
                    {formatDueWindow(order.requested_due_date, order.requested_due_time, tc)}
                  </Typography>
                  <Stack spacing={1}>
                    <DatePicker
                      value={confirmedDue ? dayjs(confirmedDue) : null}
                      onChange={(d: Dayjs | null) =>
                        setConfirmedDue(d && d.isValid() ? d.format('YYYY-MM-DD') : '')
                      }
                      format="YYYY-MM-DD"
                      slotProps={{ textField: { size: 'small', fullWidth: true } }}
                    />
                    {/* Optional, same rule as the doctor's: a confirmed date
                        with no time means "that day, any time". */}
                    <TimePicker
                      ampm={false}
                      label={t('orderSheet.confirmedDueTime')}
                      value={confirmedTime ? dayjs(`2000-01-01T${confirmedTime}`) : null}
                      onChange={(d: Dayjs | null) =>
                        setConfirmedTime(d && d.isValid() ? d.format('HH:mm') : '')
                      }
                      slotProps={{
                        textField: { size: 'small', fullWidth: true },
                        field: { clearable: true },
                      }}
                    />
                    <Button
                      variant="outlined"
                      fullWidth
                      size="small"
                      onClick={() =>
                        update.mutate({
                          confirmed_due_date: confirmedDue || null,
                          // Both in one patch: the lab writes `orders` directly
                          // under orders_lab_update, and RLS here is row-level.
                          confirmed_due_time: confirmedTime || null,
                        })
                      }
                      disabled={update.isPending}
                    >
                      {t('orderSheet.confirmDue')}
                    </Button>
                  </Stack>
                </Box>

                <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: '0.84375rem', fontWeight: 700 }}>
                      {t('finances.dialog.amountLabel')}
                    </Typography>
                    <Box sx={{ ml: 'auto' }}>
                      <PaymentStatusChip status={order.payment_status} />
                    </Box>
                  </Stack>
                  <Stack spacing={1}>
                    <TextField
                      type="number"
                      size="small"
                      value={paidAmount}
                      onChange={(e) => {
                        setPaidAmount(e.target.value);
                        setPaymentError(null);
                      }}
                      disabled={order.final_total == null}
                      fullWidth
                      error={!!paymentError}
                      inputProps={{ min: 0, step: '0.01' }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Typography sx={{ color: 'text.secondary' }}>₾</Typography>
                          </InputAdornment>
                        ),
                      }}
                      // Says why the field is dead rather than leaving the lab
                      // to guess, and carries the ceiling the RPC would clamp to.
                      helperText={
                        paymentError ??
                        (order.final_total == null
                          ? t('orderSheet.paymentNeedsFinalPrice')
                          : t('orderSheet.paymentMax', { max: formatGEL(order.final_total) }))
                      }
                    />
                    <Button
                      variant="outlined"
                      fullWidth
                      size="small"
                      disabled={order.final_total == null || recordPay.isPending}
                      onClick={() => {
                        setPaymentError(null);
                        const amount = paidAmount.trim() === '' ? 0 : parseAmount(paidAmount);
                        if (amount === null || amount < 0) {
                          setPaymentError(t('orderSheet.finalPriceInvalid'));
                          return;
                        }
                        // record_payment clamps to final_total server-side. Say
                        // so instead of letting the number quietly change under
                        // the lab after they press the button.
                        if (order.final_total != null && amount > order.final_total) {
                          setPaymentError(
                            t('orderSheet.paymentClamped', {
                              max: formatGEL(order.final_total),
                            }),
                          );
                          return;
                        }
                        recordPay.mutate(amount);
                      }}
                    >
                      {t('finances.table.record')}
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            </SectionCard>

            <OrderTeamSection orderId={order.id} labId={order.lab_id} disabled={isTerminal} />
          </>
        }
      >
        {success && (
          <Alert severity="success" onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <OrderLineage
          orderId={order.id}
          basePath="/lab/orders"
          label={t('orderSheet.lineage.continuesFrom')}
        />

        {/* The mockup's six-cell fact grid across the top of the sheet. */}
        <SectionCard>
          <Box
            sx={{
              display: 'grid',
              gap: 1.75,
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, minmax(0, 1fr))' },
            }}
          >
            <FactCell label={t('orderSheet.doctor')} value={doctorFullName || '—'} hint={doctor.phone ?? undefined} />
            <FactCell label={t('orderSheet.service')} value={serviceSnap?.name ?? '—'} />
            <FactCell
              label={t('orderSheet.dueDate')}
              value={order.requested_due_date ?? '—'}
              hint={
                order.confirmed_due_date
                  ? `${t('orderSheet.confirmedDueDate')}: ${formatDueWindow(
                      order.confirmed_due_date,
                      order.confirmed_due_time,
                      tc,
                    )}`
                  : undefined
              }
            />
            <FactCell
              label={t('orderSheet.workLocation')}
              value={locSnap?.clinic_name ?? '—'}
              hint={[locSnap?.branch_name, locSnap?.city].filter(Boolean).join(' · ') || undefined}
            />
            <FactCell
              label={t('orderSheet.invoice')}
              value={t(`orderSheet.diff.invoice.${order.invoice_recipient_type}`)}
              hint={tc(`paymentStatus.${order.payment_status}`)}
            />
            <FactCell
              label={t('orderSheet.createdAt')}
              value={dayjs(order.created_at).format('YYYY-MM-DD')}
              hint={dayjs(order.created_at).format('HH:mm')}
            />
          </Box>
        </SectionCard>

        {/* ── Edit review: banner + history dropdown + before/after diff ── */}
        {editReview && (
          <SectionCard
            accent="warning"
            icon="difference"
            title={t('orderSheet.editBanner.text')}
            meta={t('orderSheet.diff.highlightHint')}
          >
            <Stack spacing={2}>
              {/* Pull the reason out of the dropdown line so it's immediately
                  visible; reflects whichever edit is selected below. */}
              {(() => {
                const sel = edits[editReview.idx];
                if (!sel) return null;
                return (
                  <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1.25 }}>
                    <Typography variant="body1" color="text.secondary">
                      {t('orderSheet.reasonLabel')}
                    </Typography>
                    <StatusPill tone="warning">{tc(`editReasons.${sel.reason_code}`)}</StatusPill>
                    {sel.comment && (
                      <Typography variant="body1" sx={{ fontStyle: 'italic' }}>
                        “{sel.comment}”
                      </Typography>
                    )}
                  </Stack>
                );
              })()}

              <FormControl size="small" sx={{ maxWidth: 480 }}>
                <InputLabel>{t('orderSheet.history.label')}</InputLabel>
                <Select
                  label={t('orderSheet.history.label')}
                  value={editReview.idx}
                  onChange={(e) => setSelectedEditIndex(Number(e.target.value))}
                >
                  {edits.map((e, i) => (
                    <MenuItem key={e.id} value={i}>
                      {tc(`editReasons.${e.reason_code}`)} ·{' '}
                      {dayjs(e.created_at).format('YYYY-MM-DD HH:mm')}
                      {e.comment ? ` — ${e.comment}` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Stack spacing={1}>
                {/* Patient rows omitted on purpose — patient PII is doctor-only
                    and must never surface on the lab side. */}
                <DiffRow
                  label={t('orderSheet.diff.fields.workLocation')}
                  changed={editReview.diff.workLocation}
                  before={editReview.before.workLocationDisplay}
                  after={editReview.after.workLocationDisplay}
                />
                <DiffRow
                  label={t('orderSheet.diff.fields.invoiceRecipient')}
                  changed={editReview.diff.invoiceRecipient}
                  before={t(`orderSheet.diff.invoice.${editReview.before.invoiceRecipientType}`)}
                  after={t(`orderSheet.diff.invoice.${editReview.after.invoiceRecipientType}`)}
                />
              </Stack>
            </Stack>
          </SectionCard>
        )}

        {/* Context for reading the form below it, so it sits above the answers
            rather than off in the rail. */}
        <ClarificationPanel orderId={order.id} canAnswer={false} />

        {version && (
          <>
            <SectionCard
              icon="assignment"
              title={t('orderSheet.answers')}
              meta={t('orderSheet.answersMeta')}
            >
              {editReview ? (
                <OrderAnswersDiff
                  configuration={version.configuration_json}
                  pricing={version.pricing_configuration_json}
                  before={editReview.before.answers}
                  after={editReview.after.answers}
                />
              ) : (
                <OrderForm
                  configuration={version.configuration_json}
                  pricing={version.pricing_configuration_json}
                  values={answersMap}
                  onChange={() => {}}
                  readOnly
                />
              )}
            </SectionCard>

            <SectionCard icon="payments" title={tc('priceBreakdown.priceDetails')}>
              <PriceBreakdown
                variant="plain"
                pricing={version.pricing_configuration_json}
                answers={answersMap}
                rush={{ type: order.rush_type, value: order.rush_value ?? 0 }}
                finalTotal={order.final_total}
              />
            </SectionCard>
          </>
        )}
        {/* Attachments: the lab can add its own and pull the doctor's, but
            only removes what it uploaded — the doctor's files aren't the
            lab's to delete, even though RLS would permit it.

            Outside the `version` guard on purpose: a failed form-version query
            must not take the doctor's files down with it. */}
        <SectionCard icon="upload_file" title={tc('orderFiles.title')}>
          <OrderFilesField
            orderId={order.id}
            labId={order.lab_id}
            canUpload
            canRemove={(f) => f.uploaded_by_user_id === user?.id}
          />
        </SectionCard>
      </SplitLayout>

      {/* Backing out of the question backs out of the status too: the pill and
          the modal are one action, so a half-finished one shouldn't leave a
          selected status the lab never saved. */}
      <ClarificationAskDialog
        orderId={order.id}
        kind={pendingStatus === 'NEEDS_DOCTOR_INPUT' ? 'EDIT' : 'ANSWER'}
        open={clarifyOpen}
        onClose={() => {
          setClarifyOpen(false);
          setPendingStatus('');
        }}
        onSent={() => setSuccess(t('orderSheet.clarifyModal.success'))}
      />

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('orderSheet.cancelModal.title')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <DialogContentText>{t('orderSheet.cancelModal.body')}</DialogContentText>
            <TextField
              label={t('orderSheet.cancelModal.reasonLabel')}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              multiline
              minRows={3}
              fullWidth
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)} color="inherit">
            {t('orderSheet.cancelModal.keep')}
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={!cancelReason.trim() || cancel.isPending}
            onClick={() => cancel.mutate(cancelReason.trim())}
          >
            {t('orderSheet.cancelModal.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/**
 * One field in the edit diff, drawn as the mockup does it: a tinted box with
 * the old value struck through, an arrow, then the new one. Unchanged fields
 * keep the same box on a neutral fill so the set reads as one block.
 */
function DiffRow({
  label,
  changed,
  before,
  after,
}: {
  label: string;
  changed: boolean;
  before: string | undefined | null;
  after: string | undefined | null;
}) {
  return (
    <Box
      sx={(theme) => ({
        border: 1,
        borderRadius: `${11}px`,
        px: 1.875,
        py: 1.375,
        borderColor: changed
          ? tone('warning', theme.palette.mode).border
          : theme.palette.divider,
        bgcolor: changed
          ? tone('warning', theme.palette.mode).bg
          : tone('neutral', theme.palette.mode).bg,
      })}
    >
      <FieldLabel>{label}</FieldLabel>
      <Stack direction="row" alignItems="center" sx={{ mt: 0.625, flexWrap: 'wrap', gap: 1.25 }}>
        {changed && (
          <>
            <Typography
              sx={{ fontSize: '0.8125rem', color: 'text.secondary', textDecoration: 'line-through' }}
            >
              {before || '—'}
            </Typography>
            <Icon name="arrow_forward" size={15} sx={{ color: 'warning.dark' }} />
          </>
        )}
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700 }}>{after || '—'}</Typography>
      </Stack>
    </Box>
  );
}
