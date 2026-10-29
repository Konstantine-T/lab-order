import { useMemo, useState } from 'react';
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
import { formatDueWindow } from '@/features/orders/orderDates';
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
import { ClarificationPanel } from '@/features/orders/clarifications/ClarificationPanel';
import { DOCTOR_DETAIL_ORDER_SELECT } from '@/features/orders/detail/types';
import { trashStateOf } from '@/features/orders/trash/trashApi';
import { OrderGoneNotice } from '@/features/orders/trash/TrashedOrderNotices';
import { LiveUpdateBanner } from '@/features/notifications/LiveSurfaces';
import { useLiveFormSync } from '@/features/notifications/liveContext';
import { useBuyerMode } from '@/features/labBuying/buyerMode';
import {
  buyerPatientPayload,
  snapshotDeliveryLine,
  snapshotInvoiceLine,
} from '@/features/labBuying/buyerOrder';
import { orderErrorText } from '@/features/labBuying/buyerErrors';
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
  /** This side's trash row, if any (0054; the clinic's RLS reads none). */
  order_trash?: { purge_after: string }[];
};

const EDIT_REASONS: EditReasonCode[] = [
  'CORRECTION',
  'UNFORESEEN_LAB_INSTRUCTION',
  'PATIENT_REASON',
  'CONSTRUCTION_DEFECT',
  'MY_MISTAKE',
  'UNFORESEEN_EVENT',
];

/**
 * Change an order with a reason: the doctor's, the clinic's for one of its
 * doctors (`basePath="/clinic/orders"`), or with `buyer` a lab's order to
 * another lab (0048, `basePath="/lab/purchases"`): the patient optional with
 * a reference, delivery and invoice read-only, everything read through the
 * lab's buying profile.
 */
export function OrderEditPage({
  basePath = '/doctor/orders',
  buyer: buyerProp = false,
}: { basePath?: string; buyer?: boolean } = {}) {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { t: te } = useTranslation('errors');
  const { t: tl } = useTranslation('lab');
  const { user } = useAuth();
  const buyer = useBuyerMode(buyerProp);
  // By the route's `buyer` prop, not by whether buyer mode resolved: a
  // purchase route never falls back to the doctor's unfiltered read (0048).
  const authDoctorId = buyerProp ? (buyer?.profileId ?? undefined) : user?.doctor_profile?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [state, setState] = useState<WizardState>(initialState);
  const [reason, setReason] = useState<EditReasonCode | ''>('');
  const [comment, setComment] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    enabled: !!orderId && (!buyerProp || !!authDoctorId),
    queryFn: async () => {
      let q = supabase
        .from('orders')
        // The detail page's select, not a narrower one: both screens share
        // `['order', id]`, and saving here refetches it just as the detail
        // page mounts — which then keeps whatever this fetch returns.
        .select(DOCTOR_DETAIL_ORDER_SELECT)
        .eq('id', orderId!);
      // A buying lab's own purchase only, never an order it receives (0048,
      // B3). The clinic cannot know the doctor before the order loads.
      if (buyerProp) q = q.eq('doctor_id', authDoctorId!);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as OrderDetail | null;
    },
  });
  // A buying lab reads the rest only once the order has proved to be its own.
  const orderReady = !buyerProp || !!order;

  // The order's doctor — the logged-in doctor for a doctor, or the target doctor
  // when a clinic admin edits on their behalf (edit_order authorizes via 0014).
  const doctorId = order?.doctor_id ?? authDoctorId;

  // Delivery and invoice that cannot be changed here (0050): an order placed
  // for a clinic keeps the clinic's (edit_order ignores what is sent), and a
  // clinic admin cannot read the doctor's own locations to offer another. An
  // order from before 0050 has the doctor's location even when it was
  // backfilled to a clinic, and the doctor still edits it as before.
  const clinicFixed = !!order?.clinic_id && !order.doctor_work_location_id && !order.buyer_lab_id;
  const deliveryReadOnly = clinicFixed || user?.role === 'CLINIC_ADMIN';

  const { data: answers = [], isSuccess: answersLoaded } = useQuery({
    queryKey: ['order-answers', orderId],
    enabled: !!orderId && orderReady,
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
    // A buying lab's delivery is not a choice (0048), nor a clinic order's
    // (0050); and it waits for the order, which decides the latter.
    enabled: !!doctorId && !buyer && !!order && !deliveryReadOnly,
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

  // Pre-fill the form from the order's current values, and keep it in step
  // with the order afterwards without touching anything the doctor has typed
  // (useLiveFormSync): the lab can change the order while this page is open.
  // We wait for the answers query too (not just the order), otherwise we'd
  // seed an empty answers map while that separate request is still in flight.
  // existing_id is seeded with the order's patient so an unchanged patient
  // stays the exact same row; PatientStep clears it the moment the doctor
  // edits a name.
  const seeded = useMemo(() => {
    if (!order || !answersLoaded) return null;
    const answersMap: Record<string, unknown> = {};
    for (const a of answers) answersMap[a.field_code] = a.answer_json;
    return {
      lab_id: order.lab_id,
      lab_service_id: order.lab_service_id,
      patient: {
        first_name: order.patients?.first_name ?? '',
        last_name: order.patients?.last_name ?? '',
        date_of_birth: order.patients?.date_of_birth ?? '',
        gender: order.patients?.gender ?? '',
        existing_id: order.patient_id ?? undefined,
      } as WizardState['patient'],
      // A lab's purchase may have no patient, and its own reference (0048).
      with_patient: !!order.patient_id,
      patient_reference: order.patient_reference ?? '',
      answers: answersMap,
      // None on an order placed for a clinic (0050).
      doctor_work_location_id: order.doctor_work_location_id ?? '',
      requested_due_date: order.requested_due_date ?? '',
      invoice_recipient_type: order.invoice_recipient_type as WizardState['invoice_recipient_type'],
    };
  }, [order, answersLoaded, answers]);
  const live = useLiveFormSync({
    identity: seeded ? orderId : undefined,
    // Anything else the lab changes (status, price, a question) also counts as
    // "the order was updated" while the doctor has unsaved changes.
    incoming: seeded && order ? { fields: seeded, context: order.updated_at } : null,
    values: {
      lab_id: state.lab_id,
      lab_service_id: state.lab_service_id,
      patient: state.patient,
      with_patient: state.with_patient,
      patient_reference: state.patient_reference,
      answers: state.answers,
      doctor_work_location_id: state.doctor_work_location_id,
      requested_due_date: state.requested_due_date,
      invoice_recipient_type: state.invoice_recipient_type,
    },
    apply: (fields) => setState((s) => ({ ...s, ...fields })),
  });

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
        // A buying lab's may be "no patient", with a reference (0048).
        p_patient: buyer ? buyerPatientPayload(state) : normalizePatientPayload(state.patient),
        // Ignored for a buying lab (its own address, its own company) and for
        // an order placed for a clinic (the clinic's). A clinic admin editing
        // an older order sends the location it already has.
        p_doctor_work_location_id: buyer || clinicFixed
          ? state.doctor_work_location_id || null
          : state.doctor_work_location_id,
        p_invoice_recipient_type: buyer ? 'LAB' : state.invoice_recipient_type,
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
      // Saving an edit can close an open "change the order" request and clear
      // the status behind it (0030/0033), so the panel, the badge and the
      // doctor's home list are all stale the moment this returns.
      qc.invalidateQueries({ queryKey: ['order-clarifications', orderId] });
      qc.invalidateQueries({ queryKey: ['nav-alerts'] });
      qc.invalidateQueries({ queryKey: ['doctor-home-orders'] });
      navigate(`${basePath}/${orderId}`);
    },
    // Every known refusal in words (the 0048 codes and the RPC's sentences);
    // a buying lab never sees a raw message.
    onError: (e) =>
      setError(
        orderErrorText(e, te) ??
          (buyer ? tc('errors.generic') : e instanceof Error ? e.message : 'Error'),
      ),
  });

  const [problems, setProblems] = useState<OrderProblem[]>([]);
  // Same as the wizard: a corrected field must clear without a second save.
  const liveProblems = problems.length === 0 ? problems : collectOrderProblems({
    patient: state.patient,
    answers: state.answers,
    doctor_work_location_id: state.doctor_work_location_id,
    requested_due_date: state.requested_due_date,
    checkDueDate: false,
    configuration: version?.configuration_json,
    pricing: version?.pricing_configuration_json,
    minDays: 0,
    noLocations: locations.length === 0,
    noPatient: !!buyer && !state.with_patient,
    deliveryFixed: !!buyer || deliveryReadOnly,
    edit: { reasonCode: reason, comment, commentRequired },
  });
  // No locations at all is a different problem, and the callout says it.
  const locationError = hasProblem(liveProblems, 'workLocation') && locations.length > 0;

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
      noPatient: !!buyer && !state.with_patient,
      deliveryFixed: !!buyer || deliveryReadOnly,
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

  // Deleted from this side's list for good (0054, C3): not even its code. An
  // order in the trash is finished, so it falls to "not editable" below.
  if (trashStateOf(order.order_trash).kind === 'gone') {
    return (
      <OrderGoneNotice
        ordersPath={basePath}
        ordersLabel={buyerProp ? tl('nav.purchases') : t('nav.orders')}
      />
    );
  }

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

      {/* The lab changed the order while the doctor had unsaved edits. */}
      {live.stale && <LiveUpdateBanner onReload={live.reload} />}

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
                  {formatDueWindow(order.requested_due_date, order.requested_due_time, tc)}
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

        {liveProblems.length > 0 && (
          <Alert severity="error">
            {liveProblems.length === 1 ? (
              orderProblemMessage(liveProblems[0], t)
            ) : (
              <>
                {t('orderCreate.fixTheseFields')}
                <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.5 }}>
                  {liveProblems.map((p, i) => (
                    <li key={i}>{orderProblemMessage(p, t)}</li>
                  ))}
                </Box>
              </>
            )}
          </Alert>
        )}

        {/* The lab's request, above the fields it is about.
            The dashboard's "Waiting on you" card sends the doctor straight
            here, so without this the one screen where the change actually
            gets made is the one screen that never says what was asked for —
            leaving them to go back to the order to re-read it.

            `canAnswer` is the doctor's voice, not a claim they can type a
            reply: it picks "make the change below" over the lab's own
            "waiting for the doctor", and an edit request renders no answer
            box either way. No `editTo` — its CTA would link to this page. */}
        {orderId && <ClarificationPanel orderId={orderId} canAnswer />}

        <PatientStep
          state={state}
          update={update}
          doctorId={doctorId ?? ''}
          patientAttempted={attempted}
          patientOptional={!!buyer}
        />

        {buyer || deliveryReadOnly ? (
          // A lab's purchase (0048), or an order for a clinic (0050): where it
          // goes and who is invoiced are as the order was placed.
          <SectionCard icon="location_on" title={t('labBuyer.fixedTitle')}>
            <DetailList>
              <DetailRow label={t('labBuyer.deliveredTo')} labelWidth={120}>
                {(buyer
                  ? snapshotDeliveryLine(order.work_location_snapshot)
                  : [
                      (order.work_location_snapshot as { clinic_name?: string }).clinic_name,
                      snapshotDeliveryLine(order.work_location_snapshot),
                    ]
                      .filter(Boolean)
                      .join(', ')) || '—'}
              </DetailRow>
              <DetailRow label={t('labBuyer.invoiceTo')} labelWidth={120}>
                {snapshotInvoiceLine(order.invoice_recipient_snapshot, t) || '—'}
              </DetailRow>
            </DetailList>
          </SectionCard>
        ) : (
          /* Work location + invoice recipient */
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
        )}

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
