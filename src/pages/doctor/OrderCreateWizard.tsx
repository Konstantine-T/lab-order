import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { OrderForm, isOrderFormValid } from '@/features/orderForms/OrderForm';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { MobilePriceBar } from '@/components/MobilePriceBar';
import {
  Callout,
  FieldLabel,
  Icon,
  InitialsAvatar,
  PageHeader,
  SectionCard,
  Segmented,
  SplitLayout,
} from '@/components/design';
import { calculatePrice, formatGEL } from '@/utils/pricing';
import type {
  DoctorWorkLocationRow,
  LabFormVersionRow,
  LabRow,
  LabServiceRow,
  PatientRow,
  PricingConfig,
  RushType,
} from '@/types/database';
import { initialState, type WizardState } from '@/features/doctor/orderCreate/types';
import {
  normalizeName,
  normalizePatientPayload,
} from '@/features/doctor/orderCreate/patientName';
import { PendingOrderFilesField } from '@/features/orders/orderFiles/OrderFilesField';
import { uploadOrderFile } from '@/features/orders/orderFiles/orderFilesApi';
import { scrollToFirstError } from '@/features/orderForms/scrollToFirstError';
import {
  loadDraft,
  clearDraft,
  useDebouncedDraftAutosave,
  type DraftBrokenness,
} from '@/features/doctor/orderCreate/draftStorage';

/** Effective rush surcharge derived from the lab's pricing config + the
 * doctor's rush toggle. Returns undefined → calculatePrice falls back to no
 * rush. */
function effectiveRush(
  pricing: PricingConfig | undefined,
  rushRequested: boolean,
): { type: RushType; value: number } | undefined {
  if (!rushRequested) return { type: 'NONE', value: 0 };
  const r = pricing?.rush;
  if (!r || r.type === 'NONE') return { type: 'NONE', value: 0 };
  return { type: r.type, value: r.value ?? 0 };
}

/** Minimum number of days between today and the doctor's requested due date.
 *  - Rush requested → use lab's rush turnaround_days (falls back to 1).
 *  - Otherwise → use service.average_turnaround_days (falls back to 1). */
function minTurnaroundDays(
  averageDays: number | null | undefined,
  pricing: PricingConfig | undefined,
  rushRequested: boolean,
): number {
  if (rushRequested) {
    const rd = pricing?.rush?.turnaround_days;
    if (rd && rd > 0) return rd;
  }
  return Math.max(1, averageDays ?? 1);
}

export function OrderCreateWizard() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const doctorId = user?.doctor_profile?.id;

  const labParam = params.get('lab') ?? '';
  const serviceParam = params.get('service') ?? '';
  // Set when continuing a project: pre-fill + lock the patient, link lineage.
  const patientParam = params.get('patient') ?? '';
  const continuesParam = params.get('continues') ?? '';
  const isContinuation = !!patientParam;

  const [state, setState] = useState<WizardState>(() => ({
    ...initialState,
    lab_id: labParam,
    lab_service_id: serviceParam,
  }));
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [patientAttempted, setPatientAttempted] = useState(false);
  const [filesAttempted, setFilesAttempted] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);
  // Attachments picked while filling the form. Deliberately NOT in `state`:
  // the draft autosaves as JSON and a File can't be serialized, so a resumed
  // draft simply starts with an empty list.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [failedUploads, setFailedUploads] = useState<string[]>([]);
  const [dismissedBroken, setDismissedBroken] = useState(false);
  const draftHydratedRef = useRef(false);
  const continuePatientRef = useRef(false);
  const queryClient = useQueryClient();

  const update = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));

  // No lab/service in the URL → bounce to marketplace so the doctor picks one.
  useEffect(() => {
    if (!labParam || !serviceParam) {
      navigate('/doctor/marketplace', { replace: true });
    }
  }, [labParam, serviceParam, navigate]);

  // Load draft from Supabase once.
  const { data: draftData, isSuccess: draftLoaded } = useQuery({
    queryKey: ['doctor-draft', doctorId],
    enabled: !!doctorId,
    queryFn: () => loadDraft(doctorId!),
    staleTime: Infinity,
    gcTime: 0,
  });

  // Hydrate wizard state from draft when it arrives (once, if lab/service match).
  useEffect(() => {
    if (!draftLoaded || draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    if (
      draftData &&
      draftData.state.lab_id === labParam &&
      draftData.state.lab_service_id === serviceParam
    ) {
      // Clear existing_id so the patient-match dialog re-shows on resume.
      // The stored draft.step is ignored now — single page, no steps.
      setState({
        ...draftData.state,
        patient: { ...draftData.state.patient, existing_id: undefined },
      });
    }
  }, [draftLoaded, draftData, labParam, serviceParam]);

  // Continue-project: load the locked patient and seed it as an existing
  // patient (existing_id set → no match dialog). By the time we're here the
  // draft-collision modal has already cleared any conflicting draft.
  const { data: continuePatientRow } = useQuery({
    queryKey: ['continue-patient', patientParam, doctorId],
    enabled: !!patientParam && !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientParam)
        .eq('doctor_id', doctorId!)
        .maybeSingle();
      if (error) throw error;
      return data as PatientRow | null;
    },
  });

  useEffect(() => {
    if (!isContinuation || continuePatientRef.current || !continuePatientRow) return;
    continuePatientRef.current = true; // seed once
    update({
      patient: {
        first_name: continuePatientRow.first_name,
        last_name: continuePatientRow.last_name,
        date_of_birth: continuePatientRow.date_of_birth ?? '',
        gender: continuePatientRow.gender ?? '',
        existing_id: continuePatientRow.id,
      },
    });
  }, [isContinuation, continuePatientRow]);

  // ----- Data queries -------------------------------------------------------
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

  // Default work location once known
  useEffect(() => {
    if (!state.doctor_work_location_id && locations[0]) {
      update({ doctor_work_location_id: locations[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  // The single service the doctor picked from the marketplace, plus its
  // linked form's current version. We don't need to load all labs/services
  // anymore — the lab + service are baked in via URL params.
  const { data: selectedService } = useQuery({
    queryKey: ['orderable-service', state.lab_service_id, state.lab_id],
    enabled: !!state.lab_service_id && !!state.lab_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_services')
        .select(
          '*, lab_forms!lab_services_linked_form_fk(id, status, current_version_id, title)',
        )
        .eq('id', state.lab_service_id)
        .eq('lab_id', state.lab_id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data as
        | (LabServiceRow & {
            lab_forms: { id: string; status: string; current_version_id: string | null; title: string } | null;
          })
        | null;
    },
  });

  const { data: lab } = useQuery({
    queryKey: ['orderable-lab', state.lab_id],
    enabled: !!state.lab_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labs')
        .select('id, public_name, city, logo_url')
        .eq('id', state.lab_id)
        .eq('approval_status', 'APPROVED_ACTIVE')
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<LabRow, 'id' | 'public_name' | 'city' | 'logo_url'> | null;
    },
  });

  const linkedForm = selectedService?.lab_forms;

  const { data: version } = useQuery({
    queryKey: ['order-form-version', linkedForm?.current_version_id],
    enabled: !!linkedForm?.current_version_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_form_versions')
        .select('*')
        .eq('id', linkedForm!.current_version_id!)
        .maybeSingle();
      if (error) throw error;
      return data as LabFormVersionRow | null;
    },
  });

  // ----- Broken-draft detection ------------------------------------------------
  // The orderable-lab and orderable-service queries already filter by
  // is_active / approval_status, so a null result means unavailable.
  const draftBrokenness = useMemo<DraftBrokenness | null>(() => {
    if (!draftLoaded || !draftData) return null;
    if (!lab) return { broken: true, reason: 'lab_unavailable' as const };
    if (!selectedService) return { broken: true, reason: 'service_unavailable' as const };
    const form = selectedService.lab_forms;
    if (!form || form.status !== 'PUBLISHED') {
      return { broken: true, reason: 'form_unavailable' as const };
    }
    return { broken: false };
  }, [draftLoaded, draftData, lab, selectedService]);

  const isBroken = (draftBrokenness?.broken ?? false) && !dismissedBroken;

  // ----- Autosave (debounced, starts after draft is loaded) ----------------
  // Once the order is submitted, stop autosaving. Otherwise the hook's
  // unmount flush re-creates the draft row we just deleted in onSuccess,
  // and OrdersListPage's modal pops up again for a phantom draft.
  // step is hard-coded to 0 now — the wizard is a single page with no steps,
  // but the draft schema (and OrdersListPage's resume modal) still expect the
  // column, so we keep writing 0 to avoid a migration.
  useDebouncedDraftAutosave(
    draftLoaded && !submittedOrderId ? doctorId : undefined,
    state,
    0,
    lab?.public_name ?? '',
    selectedService?.name ?? '',
  );

  // ----- Validation ---------------------------------------------------------
  // Single page now: the checks that used to gate each step transition run once
  // on Submit. We flip all three "attempted" flags up front so every section
  // surfaces its inline errors at once, then return on the first hard failure
  // for the top-level banner + scroll.
  const validateAll = (): boolean => {
    setError(null);
    setPatientAttempted(true);
    setSubmitAttempted(true);
    setFilesAttempted(true);

    if (!state.patient.first_name || !state.patient.last_name) {
      setError(tc('errors.required'));
      scrollToFirstError();
      return false;
    }
    if (!linkedForm || linkedForm.status !== 'PUBLISHED') {
      setError(t('orderCreate.labService.noPublishedForm'));
      return false;
    }
    if (
      version &&
      !isOrderFormValid(
        version.configuration_json,
        state.answers,
        version.pricing_configuration_json,
      )
    ) {
      setError(tc('errors.required'));
      scrollToFirstError();
      return false;
    }
    if (!state.doctor_work_location_id) {
      setError(tc('errors.required'));
      scrollToFirstError();
      return false;
    }
    if (!state.requested_due_date) {
      setError(tc('errors.required'));
      scrollToFirstError();
      return false;
    }
    const minDays = minTurnaroundDays(
      selectedService?.average_turnaround_days,
      version?.pricing_configuration_json,
      state.rush_requested,
    );
    const minDate = dayjs().startOf('day').add(minDays, 'day');
    if (dayjs(state.requested_due_date).isBefore(minDate, 'day')) {
      setError(t('orderCreate.filesAndDue.dueDate'));
      scrollToFirstError();
      return false;
    }
    return true;
  };

  const handleSubmit = () => {
    if (validateAll()) submit.mutate();
  };

  // ----- Derived rush -------------------------------------------------------
  const rush = effectiveRush(version?.pricing_configuration_json, state.rush_requested);

  // If the lab disables rush after the doctor opted in (e.g. they edit a saved
  // draft after a pricing change), drop the toggle silently.
  useEffect(() => {
    if (!version) return;
    const labRushType = version.pricing_configuration_json?.rush?.type ?? 'NONE';
    if (state.rush_requested && labRushType === 'NONE') {
      update({ rush_requested: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, state.rush_requested]);

  // ----- Submit -------------------------------------------------------------
  const generatedTotal = useMemo(() => {
    if (!version) return null;
    const result = calculatePrice(version.pricing_configuration_json, state.answers, rush);
    return result.kind === 'CALCULATED' ? result.total : null;
  }, [version, state.answers, rush]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!version) throw new Error('No form version');
      const submittedRush = rush ?? { type: 'NONE' as RushType, value: 0 };
      const { data, error } = await supabase.rpc('submit_order', {
        p_lab_id: state.lab_id,
        p_lab_service_id: state.lab_service_id,
        p_doctor_work_location_id: state.doctor_work_location_id,
        // Normalized so the server's dedup guard sees the same string the
        // wizard's match lookup did — otherwise "გივი " and "გივი" become two
        // patients.
        p_patient: normalizePatientPayload(state.patient),
        p_lab_form_version_id: version.id,
        p_invoice_recipient_type: state.invoice_recipient_type,
        p_requested_due_date: state.requested_due_date || null,
        p_rush_type: submittedRush.type,
        p_rush_value: submittedRush.type === 'NONE' ? null : submittedRush.value,
        p_answers: state.answers,
        p_generated_total: generatedTotal,
        p_continues_order_id: continuesParam || null,
      });
      if (error) throw error;
      const orderId = data as string;

      // Files can only be uploaded once the order exists: the storage path and
      // every RLS policy on the bucket key off the order id. A failure here is
      // NOT fatal — the order is already placed, so we collect the names and
      // let the doctor re-attach from the order page.
      if (pendingFiles.length > 0 && user) {
        const failed: string[] = [];
        for (const f of pendingFiles) {
          try {
            await uploadOrderFile({ id: orderId, lab_id: state.lab_id }, f, user.id, user.role);
          } catch {
            failed.push(f.name);
          }
        }
        if (failed.length) setFailedUploads(failed);
      }
      return orderId;
    },
    onSuccess: async (orderId) => {
      // Delete the draft row, then nuke the cached value so other mounted
      // pages (e.g. OrdersListPage in browser back/forward cache) don't see
      // a phantom draft. setQueryData is for already-mounted readers,
      // invalidate is for the next fresh read.
      if (doctorId) {
        try {
          await clearDraft(doctorId);
        } catch {
          // Swallow — the DB delete might race with submit, but the order
          // already exists, so the doctor isn't blocked. The cache update
          // below still runs.
        }
        queryClient.setQueryData(['doctor-draft', doctorId], null);
        queryClient.invalidateQueries({ queryKey: ['doctor-draft', doctorId] });
        queryClient.removeQueries({ queryKey: ['draft-broken-check'] });
      }
      setSubmittedOrderId(orderId);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  if (submittedOrderId) {
    return (
      <Stack spacing={2} alignItems="center" sx={{ maxWidth: 520, mx: 'auto', py: 8 }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'success.main',
            color: '#fff',
          }}
        >
          <Icon name="check" size={34} />
        </Box>
        <Typography variant="h3" component="h1" sx={{ textAlign: 'center' }}>
          {t('orderCreate.review.submitSuccess')}
        </Typography>
        {/* The order is placed either way — a failed attachment must not read
            as a failed order, so this is a warning, not an error. */}
        {failedUploads.length > 0 && (
          <Callout tone="warning">
            {tc('orderFiles.errors.partialSubmit', { names: failedUploads.join(', ') })}
          </Callout>
        )}
        <Stack direction="row" spacing={1.5} sx={{ pt: 1 }}>
          <Button variant="contained" onClick={() => navigate(`/doctor/orders/${submittedOrderId}`)}>
            {tc('actions.viewDetails')}
          </Button>
          <Button variant="outlined" onClick={() => navigate('/doctor/orders')}>
            {t('nav.orders')}
          </Button>
        </Stack>
      </Stack>
    );
  }

  // Selected work location — drives the clinic-code warning in the invoice card.
  const selectedLoc = locations.find((l) => l.id === state.doctor_work_location_id);

  const patientName = `${state.patient.first_name} ${state.patient.last_name}`.trim();

  return (
    <>
      <PageHeader
        backTo="/doctor/marketplace"
        title={t('orderCreate.title')}
        subtitle={`${t('nav.orders')} / ${t('orderCreate.title')}`}
        chips={
          lab &&
          selectedService && (
            // The lab + service capsule the mockup pins next to the title, with
            // its own "Change" escape hatch back to the marketplace.
            <Stack
              direction="row"
              alignItems="center"
              spacing={1.125}
              sx={{
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                borderRadius: 999,
                pl: 0.75,
                pr: 1,
                py: 0.75,
              }}
            >
              <InitialsAvatar name={lab.public_name} size={24} shape="circle" variant="brand" />
              <Typography sx={{ fontSize: '0.78125rem', fontWeight: 600 }}>
                {lab.public_name}{' '}
                <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  · {selectedService.name}
                </Box>
              </Typography>
              <Button size="small" sx={{ p: 0.5, minWidth: 0 }} onClick={() => navigate('/doctor/marketplace')}>
                {t('orderCreate.changeLabService')}
              </Button>
            </Stack>
          )
        }
        actions={
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Icon name="cloud_done" size={15} sx={{ color: 'success.main' }} />
            <Typography variant="body2" color="text.secondary" noWrap>
              {t('orderCreate.draftSaved')}
            </Typography>
          </Stack>
        }
      />

      <SplitLayout
        rail={
          <>
            <SummaryRail
              state={state}
              update={update}
              locations={locations}
              version={version}
              rush={rush}
              selectedLoc={selectedLoc}
              averageTurnaroundDays={selectedService?.average_turnaround_days ?? null}
              filesAttempted={filesAttempted}
              patientName={patientName}
              submitting={submit.isPending}
              disabled={isBroken}
              showError={submitAttempted && !!error}
              onSubmit={handleSubmit}
              onAddLocation={() => navigate('/doctor/work-locations')}
            />
            <Callout tone="brand">{t('orderCreate.railHint')}</Callout>
          </>
        }
      >
        {isBroken && (
          <Callout tone="warning" title={t('orderCreate.brokenDraft.alert')}>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" onClick={() => setDismissedBroken(true)}>
                {t('orderCreate.brokenDraft.keepAnswers')}
              </Button>
              <Button
                size="small"
                color="error"
                onClick={async () => {
                  if (doctorId) await clearDraft(doctorId);
                  setDismissedBroken(false);
                  setState({ ...initialState, lab_id: labParam, lab_service_id: serviceParam });
                }}
              >
                {t('orderCreate.brokenDraft.discard')}
              </Button>
            </Stack>
          </Callout>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {/* Single scrolling page: all sections stacked top-to-bottom. */}
        <PatientStep
          state={state}
          update={update}
          doctorId={doctorId ?? ''}
          patientAttempted={patientAttempted}
          readOnly={isContinuation}
        />

        {version && (
          <FormStep state={state} update={update} version={version} showErrors={submitAttempted} />
        )}

        <FilesCard
          files={pendingFiles}
          onChange={setPendingFiles}
          disabled={submit.isPending}
        />
      </SplitLayout>

      {/* Page level, not inside the rail: on mobile the rail sits at the top,
          so the running total would scroll away as the doctor fills the form. */}
      <MobilePriceBar
        pricing={version?.pricing_configuration_json}
        answers={state.answers}
        rush={rush}
      />
    </>
  );
}

// ============================================================================
// Files
// ============================================================================
/**
 * The wizard's Files card. Uploads land in a later phase, so this shows the
 * mockup's dropzone chrome with the "coming soon" note rather than a control
 * that would do nothing.
 */
function FilesCard({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('doctor');
  return (
    <SectionCard
      icon="upload_file"
      title={t('orderCreate.filesAndDue.files')}
      meta={t('orderCreate.filesAndDue.uploadHint')}
    >
      {/* Picked now, uploaded after submit — see the submit mutation. */}
      <PendingOrderFilesField files={files} onChange={onChange} disabled={disabled} />
    </SectionCard>
  );
}

// ============================================================================
// Step 1 — Patient
// ============================================================================
// Exported so the edit page (OrderEditPage) can reuse the exact same patient
// fields + match dialog without duplicating the UI.
export function PatientStep({
  state,
  update,
  doctorId,
  patientAttempted,
  readOnly,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  doctorId: string;
  patientAttempted?: boolean;
  /** Continue-project: the patient is fixed, so lock the fields + match dialog. */
  readOnly?: boolean;
}) {
  const { t } = useTranslation('doctor');
  const [match, setMatch] = useState<PatientRow | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);

  // The one place the lookup happens, so the debounce and the blur handler
  // can't drift. Names go out normalized — the RPC compares on the same rule,
  // and sending the raw value would miss a match over a stray space.
  const lookupMatch = useCallback(() => {
    if (readOnly) return; // locked patient never needs the match lookup
    const { first_name, last_name, existing_id, date_of_birth, gender } = state.patient;
    if (!first_name.trim() || !last_name.trim() || !doctorId || existing_id) return;

    void supabase
      .rpc('find_matching_patient', {
        p_first: normalizeName(first_name),
        p_last: normalizeName(last_name),
        p_dob: date_of_birth || null,
        p_gender: gender || null,
      })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setMatch(data[0] as PatientRow);
          setMatchOpen(true);
        }
      });
  }, [state.patient, doctorId, readOnly]);

  // Trigger match check as soon as first + last name are filled; gender/DOB
  // are no longer required because the RPC now matches on name only.
  useEffect(() => {
    if (readOnly || state.patient.existing_id) return;
    if (!state.patient.first_name.trim() || !state.patient.last_name.trim()) return;

    // 400ms debounce so we don't hit the RPC on every keystroke while the
    // doctor is still typing the name.
    const timer = setTimeout(lookupMatch, 400);
    return () => clearTimeout(timer);
    // Deliberately keyed on the names only: re-running on every `lookupMatch`
    // identity (it closes over the whole patient object) would restart the
    // debounce when the doctor edits DOB or gender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.patient.first_name,
    state.patient.last_name,
    state.patient.existing_id,
    doctorId,
    readOnly,
  ]);

  const complete = !!state.patient.first_name.trim() && !!state.patient.last_name.trim();

  return (
    <SectionCard
      icon="person"
      title={t('orderCreate.patient.header')}
      done={complete}
      error={patientAttempted && !complete ? t('orderCreate.required') : undefined}
    >
        <Stack spacing={2}>
          {readOnly && (
            <Callout tone="brand">{t('orderCreate.patient.lockedForContinuation')}</Callout>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label={t('orderCreate.patient.firstName')}
              value={state.patient.first_name}
              onChange={(e) =>
                update({ patient: { ...state.patient, first_name: e.target.value, existing_id: undefined } })
              }
              // Also check on blur: the debounce is keyed on the names, so a
              // doctor who types the name then tabs straight to DOB would
              // otherwise never see the match dialog.
              onBlur={lookupMatch}
              fullWidth
              required
              disabled={readOnly}
              error={patientAttempted && !state.patient.first_name}
            />
            <TextField
              label={t('orderCreate.patient.lastName')}
              value={state.patient.last_name}
              onChange={(e) =>
                update({ patient: { ...state.patient, last_name: e.target.value, existing_id: undefined } })
              }
              onBlur={lookupMatch}
              fullWidth
              required
              disabled={readOnly}
              error={patientAttempted && !state.patient.last_name}
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <DatePicker
              label={t('orderCreate.patient.dateOfBirth')}
              value={state.patient.date_of_birth ? dayjs(state.patient.date_of_birth) : null}
              onChange={(d: Dayjs | null) =>
                update({
                  patient: {
                    ...state.patient,
                    date_of_birth: d && d.isValid() ? d.format('YYYY-MM-DD') : '',
                    existing_id: undefined,
                  },
                })
              }
              format="YYYY-MM-DD"
              disableFuture
              disabled={readOnly}
              slotProps={{ textField: { fullWidth: true } }}
            />
            <TextField
              select
              label={t('orderCreate.patient.gender')}
              value={state.patient.gender}
              onChange={(e) =>
                update({ patient: { ...state.patient, gender: e.target.value } })
              }
              fullWidth
              disabled={readOnly}
              // Float the label into the notch always — keeps it from overlapping
              // the empty placeholder when no option is picked.
              InputLabelProps={{ shrink: true }}
              SelectProps={{
                displayEmpty: true,
                renderValue: (selected) => {
                  const v = (selected ?? '') as string;
                  if (!v) {
                    return (
                      <Typography
                        component="span"
                        sx={{ color: 'text.secondary', opacity: 0.7 }}
                      >
                        {t('orderCreate.patient.genderPlaceholder')}
                      </Typography>
                    );
                  }
                  if (v === 'male' || v === 'female' || v === 'other') {
                    return t(`orderCreate.patient.genderOptions.${v}`);
                  }
                  return v;
                },
              }}
            >
              <MenuItem value="male">{t('orderCreate.patient.genderOptions.male')}</MenuItem>
              <MenuItem value="female">{t('orderCreate.patient.genderOptions.female')}</MenuItem>
              <MenuItem value="other">{t('orderCreate.patient.genderOptions.other')}</MenuItem>
            </TextField>
          </Stack>
          {state.patient.existing_id && !readOnly && (
            <Callout tone="brand" icon="how_to_reg">
              {t('orderCreate.patient.continuingExisting')}
            </Callout>
          )}
        </Stack>
      <Dialog open={matchOpen && !state.patient.existing_id && !readOnly} onClose={() => setMatchOpen(false)}>
        <DialogTitle>{t('orderCreate.patient.match.title')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('orderCreate.patient.match.body')}
          </Typography>
          {match && (
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
              {match.first_name} {match.last_name}
              {match.date_of_birth ? ` · ${match.date_of_birth}` : ''}
              {match.gender ? ` · ${match.gender}` : ''}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setMatchOpen(false);
            }}
          >
            {t('orderCreate.patient.match.createNew')}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (match) update({ patient: { ...state.patient, existing_id: match.id } });
              setMatchOpen(false);
            }}
          >
            {t('orderCreate.patient.match.continue')}
          </Button>
        </DialogActions>
      </Dialog>
    </SectionCard>
  );
}

// ============================================================================
// Step 2 — Form
// ============================================================================
// Exported for reuse on the edit page — same dental form + live price estimate.
export function FormStep({
  state,
  update,
  version,
  showErrors,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  version: LabFormVersionRow;
  showErrors?: boolean;
}) {
  const { t } = useTranslation('doctor');
  // The running total lives in the summary rail, where the mockups put it —
  // this step is purely the clinical form, one card per numbered section.
  return (
    <Stack spacing={2}>
      <Callout tone="brand">{t('orderCreate.digitalImpressionsNote')}</Callout>
      <OrderForm
        configuration={version.configuration_json}
        pricing={version.pricing_configuration_json}
        values={state.answers}
        onChange={(answers) => update({ answers })}
        showErrors={showErrors}
      />
    </Stack>
  );
}

// ============================================================================
// Summary rail
// ============================================================================
/**
 * The sticky right rail from the wizard mockup: a live price estimate, then
 * every non-clinical decision — rush, due date, work location, who gets the
 * invoice — and the submit button.
 */
function SummaryRail({
  state,
  update,
  locations,
  version,
  rush,
  selectedLoc,
  averageTurnaroundDays,
  filesAttempted,
  patientName,
  submitting,
  disabled,
  showError,
  onSubmit,
  onAddLocation,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  locations: DoctorWorkLocationRow[];
  version: LabFormVersionRow | null | undefined;
  rush: { type: RushType; value: number } | undefined;
  selectedLoc: DoctorWorkLocationRow | undefined;
  averageTurnaroundDays: number | null;
  filesAttempted?: boolean;
  patientName: string;
  submitting: boolean;
  disabled: boolean;
  showError: boolean;
  onSubmit: () => void;
  onAddLocation: () => void;
}) {
  const { t } = useTranslation('doctor');
  const pricing = version?.pricing_configuration_json;

  const labRush = pricing?.rush;
  const rushAvailable = !!labRush && labRush.type !== 'NONE';
  const minDays = minTurnaroundDays(averageTurnaroundDays, pricing, state.rush_requested);
  const minDate = useMemo(() => dayjs().startOf('day').add(minDays, 'day'), [minDays]);

  // When the toggle changes, the min due date may move past the current
  // selection. Clear an out-of-range date so the picker stays consistent.
  const handleRushToggle = (checked: boolean) => {
    const nextMinDays = minTurnaroundDays(averageTurnaroundDays, pricing, checked);
    const nextMin = dayjs().startOf('day').add(nextMinDays, 'day');
    const next: Partial<WizardState> = { rush_requested: checked };
    if (state.requested_due_date && dayjs(state.requested_due_date).isBefore(nextMin, 'day')) {
      next.requested_due_date = '';
    }
    update(next);
  };

  return (
    <SectionCard dense>
      <Box sx={{ px: 2.5, pt: 2, pb: 1.75, borderBottom: 1, borderColor: 'divider' }}>
        <Typography sx={{ fontSize: '0.90625rem', fontWeight: 700 }}>
          {t('orderCreate.summary')}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {patientName || t('orderCreate.patient.header')}
        </Typography>
      </Box>

      {version && (
        <Box sx={{ px: 2.5, py: 1.75, borderBottom: 1, borderColor: 'divider' }}>
          <PriceBreakdown
            explain
            variant="plain"
            pricing={version.pricing_configuration_json}
            answers={state.answers}
            rush={rush}
          />
        </Box>
      )}

      <Stack spacing={1.75} sx={{ px: 2.5, py: 2 }}>
        {rushAvailable && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.25}
            onClick={() => handleRushToggle(!state.rush_requested)}
            sx={{
              px: 1.625,
              py: 1.25,
              borderRadius: `${11}px`,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.default',
              cursor: 'pointer',
            }}
          >
            <Switch
              checked={state.rush_requested}
              onChange={(e) => handleRushToggle(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              size="small"
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.78125rem', fontWeight: 700 }}>
                {t('orderCreate.filesAndDue.rush')}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {labRush!.type === 'PERCENTAGE'
                  ? t('orderCreate.filesAndDue.rushSurchargePercent', { value: labRush!.value })
                  : t('orderCreate.filesAndDue.rushSurchargeFixed', {
                      amount: formatGEL(labRush!.value ?? 0),
                    })}
                {labRush!.turnaround_days != null && labRush!.turnaround_days > 0
                  ? ` · ${
                      labRush!.turnaround_days === 1
                        ? t('orderCreate.filesAndDue.rushTurnaroundOne')
                        : t('orderCreate.filesAndDue.rushTurnaroundOther', {
                            count: labRush!.turnaround_days,
                          })
                    }`
                  : ''}
              </Typography>
            </Box>
          </Stack>
        )}

        <Box data-form-error={filesAttempted && !state.requested_due_date ? 'true' : undefined}>
          <FieldLabel sx={{ mb: 0.625 }}>{t('orderCreate.filesAndDue.dueDate')} *</FieldLabel>
          <DatePicker
            value={state.requested_due_date ? dayjs(state.requested_due_date) : null}
            onChange={(d: Dayjs | null) =>
              update({ requested_due_date: d && d.isValid() ? d.format('YYYY-MM-DD') : '' })
            }
            format="YYYY-MM-DD"
            minDate={minDate}
            slotProps={{ textField: { fullWidth: true, size: 'small' } }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {t('orderCreate.filesAndDue.dueDateHint', { count: minDays })}
          </Typography>
        </Box>

        <Box data-form-error={filesAttempted && !state.doctor_work_location_id ? 'true' : undefined}>
          <FieldLabel sx={{ mb: 0.625 }}>{t('orderCreate.filesAndDue.workLocation')}</FieldLabel>
          {locations.length === 0 ? (
            <Callout
              tone="warning"
              title={t('orderCreate.filesAndDue.noLocations')}
              action={
                <Button size="small" onClick={onAddLocation}>
                  {t('orderCreate.filesAndDue.addLocation')}
                </Button>
              }
            />
          ) : (
            <TextField
              select
              size="small"
              value={state.doctor_work_location_id}
              onChange={(e) => update({ doctor_work_location_id: e.target.value })}
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
        </Box>

        <Box>
          <FieldLabel sx={{ mb: 0.75 }}>{t('orderCreate.review.invoiceRecipient')}</FieldLabel>
          <Segmented
            value={state.invoice_recipient_type}
            onChange={(v) => update({ invoice_recipient_type: v })}
            options={[
              { value: 'DOCTOR' as const, label: t('orderCreate.review.invoiceDoctor') },
              { value: 'CLINIC' as const, label: t('orderCreate.review.invoiceClinic') },
            ]}
          />
          {state.invoice_recipient_type === 'CLINIC' &&
            selectedLoc &&
            !selectedLoc.clinic_identification_code && (
              <Callout tone="warning" sx={{ mt: 1 }}>
                {t('orderCreate.review.clinicCodeWarning')}
              </Callout>
            )}
        </Box>

        {showError && (
          <Callout tone="danger" title={t('orderCreate.review.missingFields')} />
        )}

        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={onSubmit}
          disabled={submitting || disabled}
        >
          {t('orderCreate.review.submit')}
        </Button>

        <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
          <Icon name="lock" size={14} sx={{ color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {t('orderCreate.privateToLab')}
          </Typography>
        </Stack>
      </Stack>
    </SectionCard>
  );
}


