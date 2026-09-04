import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

import { PriceBreakdown } from '@/components/PriceBreakdown';
import { MobilePriceBar } from '@/components/MobilePriceBar';
import {
  Callout,
  DetailList,
  DetailRow,
  FieldLabel,
  PageHeader,
  SectionCard,
  Segmented,
  SplitLayout,
} from '@/components/design';
import { calculatePrice, formatGEL } from '@/utils/pricing';
import { scrollToFirstError } from '@/features/orderForms/scrollToFirstError';
import { PatientStep, FormStep } from '@/pages/doctor/OrderCreateWizard';
import {
  collectOrderProblems,
  hasProblem,
  orderProblemMessage,
  type OrderProblem,
} from '@/features/doctor/orderValidation';
import { initialState, type WizardState } from '@/features/doctor/orderCreate/types';
import { normalizePatientPayload } from '@/features/doctor/orderCreate/patientName';
import { OrderFilesField } from '@/features/orders/orderFiles/OrderFilesField';
import { LabContactLine } from '@/features/orders/orderFiles/LabContactLine';
import type {
  DoctorWorkLocationRow,
  EditReasonCode,
  LabFormVersionRow,
  OrderAnswerRow,
  OrderRow,
} from '@/types/database';

type OrderDetail = OrderRow & {
  patients: {
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    gender: string | null;
  } | null;
  /** Live, not the snapshot: you email a lab at the address it has now. */
  labs: { contact_email: string | null } | null;
};

const EDIT_REASONS: EditReasonCode[] = [
  'CORRECTION',
  'UNFORESEEN_LAB_INSTRUCTION',
  'PATIENT_REASON',
  'CONSTRUCTION_DEFECT',
  'MY_MISTAKE',
  'UNFORESEEN_EVENT',
];

export function OrderEditPage({ basePath = '/doctor/orders' }: { basePath?: string } = {}) {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const authDoctorId = user?.doctor_profile?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [state, setState] = useState<WizardState>(initialState);
  const [reason, setReason] = useState<EditReasonCode | ''>('');
  const [comment, setComment] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, patients(first_name, last_name, date_of_birth, gender), labs(contact_email)')
        .eq('id', orderId!)
        .maybeSingle();
      if (error) throw error;
      return data as OrderDetail | null;
    },
  });

  // The order's doctor — the logged-in doctor for a doctor, or the target doctor
  // when a clinic admin edits on their behalf (edit_order authorizes via 0014).
  const doctorId = order?.doctor_id ?? authDoctorId;

  const { data: answers = [], isSuccess: answersLoaded } = useQuery({
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

  const { data: locations = [] } = useQuery({
    queryKey: ['doctor-locations-for-order', doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_work_locations')
        .select('*')
        .eq('doctor_id', doctorId!)
        .is('archived_at', null)
        .order('is_default', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DoctorWorkLocationRow[];
    },
  });

  // Pre-fill the form from the order's current values, once. We wait for the
  // answers query too (not just the order) — otherwise we'd hydrate with an
  // empty answers map while that separate request is still in flight, and the
  // `hydrated` guard would never let it refill. We seed existing_id with the
  // order's patient so an unchanged patient stays the exact same row —
  // PatientStep clears it the moment the doctor edits a name.
  useEffect(() => {
    if (hydrated || !order || !answersLoaded) return;
    const answersMap: Record<string, unknown> = {};
    for (const a of answers) answersMap[a.field_code] = a.answer_json;
    setState({
      ...initialState,
      lab_id: order.lab_id,
      lab_service_id: order.lab_service_id,
      patient: {
        first_name: order.patients?.first_name ?? '',
        last_name: order.patients?.last_name ?? '',
        date_of_birth: order.patients?.date_of_birth ?? '',
        gender: order.patients?.gender ?? '',
        existing_id: order.patient_id,
      },
      answers: answersMap,
      doctor_work_location_id: order.doctor_work_location_id,
      requested_due_date: order.requested_due_date ?? '',
      invoice_recipient_type: order.invoice_recipient_type,
    });
    setHydrated(true);
  }, [hydrated, order, answersLoaded, answers]);

  // Rush is locked on edit, so derive the surcharge straight from the order.
  const rush = useMemo(
    () =>
      order
        ? { type: order.rush_type, value: order.rush_value ?? 0 }
        : { type: 'NONE' as const, value: 0 },
    [order],
  );

  const generatedTotal = useMemo(() => {
    if (!version) return null;
    const result = calculatePrice(version.pricing_configuration_json, state.answers, rush);
    return result.kind === 'CALCULATED' ? result.total : null;
  }, [version, state.answers, rush]);

  const commentRequired = reason === 'UNFORESEEN_EVENT';
  const commentMissing = commentRequired && !comment.trim();

  const save = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error('No order');
      const { error } = await supabase.rpc('edit_order', {
        p_order_id: orderId,
        // Same normalization as the wizard — edit_order carries its own copy
        // of the dedup guard, so a renamed patient must not mint a duplicate.
        p_patient: normalizePatientPayload(state.patient),
        p_doctor_work_location_id: state.doctor_work_location_id,
        p_invoice_recipient_type: state.invoice_recipient_type,
        p_answers: state.answers,
        p_generated_total: generatedTotal,
        p_reason_code: reason,
        p_comment: comment.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Refresh both doctor- and lab-side caches so the edit shows up
      // everywhere without a manual reload.
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['order-answers', orderId] });
      qc.invalidateQueries({ queryKey: ['clinic-order', orderId] });
      qc.invalidateQueries({ queryKey: ['clinic-order-answers', orderId] });
      qc.invalidateQueries({ queryKey: ['clinic-orders'] });
      qc.invalidateQueries({ queryKey: ['doctor-orders'] });
      qc.invalidateQueries({ queryKey: ['doctor-patient-orders'] });
      qc.invalidateQueries({ queryKey: ['lab-order', orderId] });
      qc.invalidateQueries({ queryKey: ['lab-orders'] });
      qc.invalidateQueries({ queryKey: ['lab-edited-orders'] });
      qc.invalidateQueries({ queryKey: ['lab-unreviewed-edits-count'] });
      qc.invalidateQueries({ queryKey: ['order-edits', orderId] });
      navigate(`${basePath}/${orderId}`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  const [problems, setProblems] = useState<OrderProblem[]>([]);
  // No locations at all is a different problem, and the callout says it.
  const locationError = hasProblem(problems, 'workLocation') && locations.length > 0;

  const handleSave = () => {
    setError(null);
    setAttempted(true);

    const found = collectOrderProblems({
      patient: state.patient,
      answers: state.answers,
      doctor_work_location_id: state.doctor_work_location_id,
      // Read-only on this page — see checkDueDate.
      requested_due_date: state.requested_due_date,
      checkDueDate: false,
      configuration: version?.configuration_json,
      pricing: version?.pricing_configuration_json,
      minDays: 0,
      noLocations: locations.length === 0,
      edit: { reasonCode: reason, comment, commentRequired },
    });

    setProblems(found);
    if (found.length > 0) {
      // Every branch scrolls now. Work location, reason and comment used to
      // return without scrolling, so the banner named a field the doctor then
      // had to go and find.
      scrollToFirstError();
      return;
    }
    save.mutate();
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!order) return <Alert severity="error">{tc('errors.notFound')}</Alert>;

  const isTerminal = order.status === 'COMPLETED' || order.status === 'CANCELLED';
  if (isTerminal) {
    return (
      <>
        <PageHeader
          backTo={`${basePath}/${orderId}`}
          title={t('orderEdit.title')}
          subtitle={order.order_code}
        />
        <Callout tone="danger" title={t('orderEdit.notEditable')} />
      </>
    );
  }

  // Read-only rush summary (rush is not editable here).
  const rushText =
    order.rush_type === 'NONE'
      ? tc('rush.none')
      : order.rush_type === 'PERCENTAGE'
        ? `+${order.rush_value ?? 0}%`
        : formatGEL(order.rush_value ?? 0);

  return (
    <>
      <PageHeader
        backTo={`${basePath}/${orderId}`}
        title={t('orderEdit.title')}
        subtitle={order.order_code}
      />

      <SplitLayout
        rail={
          <>
            <SectionCard title={t('orderEdit.reasonLabel')}>
              <Stack spacing={1.75}>
                <TextField
                  select
                  required
                  size="small"
                  label={t('orderEdit.reasonLabel')}
                  value={reason}
                  onChange={(e) => setReason(e.target.value as EditReasonCode)}
                  error={attempted && !reason}
                  fullWidth
                >
                  {EDIT_REASONS.map((r) => (
                    <MenuItem key={r} value={r}>
                      {tc(`editReasons.${r}`)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label={t('orderEdit.commentLabel')}
                  size="small"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  error={attempted && commentMissing}
                  helperText={
                    commentRequired ? t('orderEdit.commentRequiredForUnforeseen') : undefined
                  }
                  multiline
                  minRows={3}
                  fullWidth
                />
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  onClick={handleSave}
                  disabled={save.isPending}
                >
                  {t('orderEdit.save')}
                </Button>
              </Stack>
            </SectionCard>

            {version && (
              <SectionCard title={tc('priceBreakdown.priceDetails')}>
                <PriceBreakdown
                  explain
                  variant="plain"
                  pricing={version.pricing_configuration_json}
                  answers={state.answers}
                  rush={rush}
                />
              </SectionCard>
            )}

            {/* Locked fields — shown so the doctor sees them but can't change them */}
            <SectionCard title={t('orderEdit.locked')}>
              <DetailList>
                <DetailRow label={t('orderCreate.filesAndDue.dueDate')} labelWidth={120}>
                  {order.requested_due_date ?? '—'}
                </DetailRow>
                <DetailRow label={t('orderCreate.filesAndDue.rush')} labelWidth={120}>
                  {rushText}
                </DetailRow>
              </DetailList>
            </SectionCard>

            <Callout tone="warning">{t('orderEdit.priceWarning')}</Callout>
          </>
        }
      >
        {error && <Alert severity="error">{error}</Alert>}

        {problems.length > 0 && (
          <Alert severity="error">
            {problems.length === 1 ? (
              orderProblemMessage(problems[0], t)
            ) : (
              <>
                {t('orderCreate.fixTheseFields')}
                <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.5 }}>
                  {problems.map((p, i) => (
                    <li key={i}>{orderProblemMessage(p, t)}</li>
                  ))}
                </Box>
              </>
            )}
          </Alert>
        )}

        <PatientStep
          state={state}
          update={update}
          doctorId={doctorId ?? ''}
          patientAttempted={attempted}
        />

        {/* Work location + invoice recipient */}
        <SectionCard
          icon="location_on"
          title={t('orderCreate.filesAndDue.workLocation')}
          // scrollToFirstError queries this; the field's own `error` supplies
          // the aria-invalid the helper matches as a fallback.
          data-form-error={locationError ? 'true' : undefined}
        >
          <Stack spacing={2.5}>
            {locations.length === 0 ? (
              <Callout tone="warning">{t('orderCreate.filesAndDue.noLocations')}</Callout>
            ) : (
              <TextField
                select
                value={state.doctor_work_location_id}
                onChange={(e) => update({ doctor_work_location_id: e.target.value })}
                error={locationError}
                helperText={locationError ? t('orderCreate.problems.workLocation') : undefined}
                fullWidth
              >
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.clinic_name}
                    {l.branch_name ? ` · ${l.branch_name}` : ''} — {l.city}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <Box>
              <FieldLabel sx={{ mb: 0.75 }}>{t('orderCreate.review.invoiceRecipient')}</FieldLabel>
              <Segmented
                value={state.invoice_recipient_type}
                onChange={(v) => update({ invoice_recipient_type: v })}
                options={[
                  { value: 'DOCTOR' as const, label: t('orderCreate.review.invoiceDoctor') },
                  { value: 'CLINIC' as const, label: t('orderCreate.review.invoiceClinic') },
                ]}
                sx={{ maxWidth: 360 }}
              />
            </Box>
          </Stack>
        </SectionCard>

        {/* Dental form answers (editable) */}
        {version && (
          <FormStep state={state} update={update} version={version} showErrors={attempted} />
        )}

        {/* The order exists here, so attachments upload immediately — and this
            is where removing them lives. */}
        <SectionCard icon="upload_file" title={tc('orderFiles.title')}>
          <OrderFilesField
            orderId={order.id}
            labId={order.lab_id}
            canUpload
            canRemove={() => true}
          />
          <LabContactLine email={order.labs?.contact_email} orderCode={order.order_code} />
        </SectionCard>
      </SplitLayout>

      {/* Same reason as the wizard: below `lg` the price rail is off-screen. */}
      <MobilePriceBar
        pricing={version?.pricing_configuration_json}
        answers={state.answers}
        rush={rush}
      />
    </>
  );
}
