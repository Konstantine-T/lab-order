import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { validateFormAnswers } from '@/components/DynamicForm';
import { OrderForm, isOrderFormValid } from '@/features/orderForms/OrderForm';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { calculatePrice, formatGEL } from '@/utils/pricing';
import { TEMPLATE_CODE_CNB } from '@/features/orderForms/cnbTypes';
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
  return { type: r.type, value: r.value };
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

const STEP_KEYS = ['patient', 'form', 'filesAndDue', 'review'] as const;

export function OrderCreateWizard() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const doctorId = user?.doctor_profile?.id;

  const labParam = params.get('lab') ?? '';
  const serviceParam = params.get('service') ?? '';

  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(() => ({
    ...initialState,
    lab_id: labParam,
    lab_service_id: serviceParam,
  }));
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);

  const update = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));

  // No lab/service in the URL → bounce to marketplace so the doctor picks one.
  useEffect(() => {
    if (!labParam || !serviceParam) {
      navigate('/doctor/marketplace', { replace: true });
    }
  }, [labParam, serviceParam, navigate]);

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

  // ----- Step navigation ----------------------------------------------------
  // Steps: 0 = patient, 1 = form, 2 = filesAndDue, 3 = review.
  const goNext = () => {
    setError(null);
    if (step === 0) {
      if (!state.patient.first_name || !state.patient.last_name) {
        setError(tc('errors.required'));
        return;
      }
      if (!linkedForm || linkedForm.status !== 'PUBLISHED') {
        setError(t('orderCreate.labService.noPublishedForm'));
        return;
      }
    }
    if (step === 1 && version) {
      const isCnb = version.configuration_json._templateCode === TEMPLATE_CODE_CNB;
      const ok = isCnb
        ? isOrderFormValid(
            version.configuration_json,
            state.answers,
            version.pricing_configuration_json,
          )
        : Object.keys(validateFormAnswers(version.configuration_json, state.answers)).length === 0;
      if (!ok) {
        setSubmitAttempted(true);
        setError(tc('errors.required'));
        return;
      }
    }
    if (step === 2) {
      if (!state.doctor_work_location_id) {
        setError(tc('errors.required'));
        return;
      }
      if (!state.requested_due_date) {
        setError(tc('errors.required'));
        return;
      }
      const minDays = minTurnaroundDays(
        selectedService?.average_turnaround_days,
        version?.pricing_configuration_json,
        state.rush_requested,
      );
      const minDate = dayjs().startOf('day').add(minDays, 'day');
      if (dayjs(state.requested_due_date).isBefore(minDate, 'day')) {
        setError(t('orderCreate.filesAndDue.dueDate'));
        return;
      }
    }
    setStep((s) => Math.min(STEP_KEYS.length - 1, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(0, s - 1));

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
        p_patient: state.patient,
        p_lab_form_version_id: version.id,
        p_invoice_recipient_type: state.invoice_recipient_type,
        p_requested_due_date: state.requested_due_date || null,
        p_rush_type: submittedRush.type,
        p_rush_value: submittedRush.type === 'NONE' ? null : submittedRush.value,
        p_answers: state.answers,
        p_generated_total: generatedTotal,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (orderId) => setSubmittedOrderId(orderId),
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  if (submittedOrderId) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 600, mx: 'auto', py: 4 }}>
        <Alert severity="success">{t('orderCreate.review.submitSuccess')}</Alert>
        <Stack direction="row" spacing={2}>
          <Button variant="contained" onClick={() => navigate(`/doctor/orders/${submittedOrderId}`)}>
            {tc('actions.viewDetails')}
          </Button>
          <Button onClick={() => navigate('/doctor/orders')}>{t('nav.orders')}</Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 920, mx: 'auto' }}>
      <Typography variant="h4">{t('orderCreate.title')}</Typography>

      <Stepper activeStep={step} alternativeLabel>
        {STEP_KEYS.map((k) => (
          <Step key={k}>
            <StepLabel>{t(`orderCreate.steps.${k}` as const)}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {lab && selectedService && (
        <Alert severity="info" icon={false} sx={{ '.MuiAlert-message': { width: '100%' } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
            <Typography variant="body2">
              <strong>{lab.public_name}</strong>
              {lab.city ? ` · ${lab.city}` : ''} — {selectedService.name}
            </Typography>
            <Button
              size="small"
              onClick={() => navigate('/doctor/marketplace')}
              sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
            >
              {t('orderCreate.changeLabService')}
            </Button>
          </Stack>
        </Alert>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {step === 0 && <PatientStep state={state} update={update} doctorId={doctorId ?? ''} />}
      {step === 1 && version && (
        <FormStep
          state={state}
          update={update}
          version={version}
          showErrors={submitAttempted}
        />
      )}
      {step === 2 && (
        <FilesAndDueStep
          state={state}
          update={update}
          locations={locations}
          pricing={version?.pricing_configuration_json}
          averageTurnaroundDays={selectedService?.average_turnaround_days ?? null}
        />
      )}
      {step === 3 && version && (
        <ReviewStep
          state={state}
          update={update}
          version={version}
          locations={locations}
          serviceName={selectedService?.name ?? ''}
          labName={lab?.public_name ?? ''}
          rush={rush}
        />
      )}

      <Stack direction="row" justifyContent="space-between">
        <Button onClick={goBack} disabled={step === 0}>
          {tc('actions.back')}
        </Button>
        {step < STEP_KEYS.length - 1 ? (
          <Button variant="contained" onClick={goNext}>
            {tc('actions.next')}
          </Button>
        ) : (
          <Button variant="contained" onClick={() => submit.mutate()} disabled={submit.isPending}>
            {t('orderCreate.review.submit')}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

// ============================================================================
// Step 1 — Patient
// ============================================================================
function PatientStep({
  state,
  update,
  doctorId,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  doctorId: string;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const [match, setMatch] = useState<PatientRow | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);

  // Trigger match check when name + dob entered
  useEffect(() => {
    const { first_name, last_name, date_of_birth } = state.patient;
    if (!first_name || !last_name || !date_of_birth || !doctorId) return;
    if (state.patient.existing_id) return;

    void supabase
      .rpc('find_matching_patient', {
        p_first: first_name,
        p_last: last_name,
        p_dob: date_of_birth,
      })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setMatch(data[0] as PatientRow);
          setMatchOpen(true);
        }
      });
  }, [
    state.patient.first_name,
    state.patient.last_name,
    state.patient.date_of_birth,
    state.patient.existing_id,
    doctorId,
  ]);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">{t('orderCreate.patient.header')}</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label={t('orderCreate.patient.firstName')}
              value={state.patient.first_name}
              onChange={(e) =>
                update({ patient: { ...state.patient, first_name: e.target.value, existing_id: undefined } })
              }
              fullWidth
            />
            <TextField
              label={t('orderCreate.patient.lastName')}
              value={state.patient.last_name}
              onChange={(e) =>
                update({ patient: { ...state.patient, last_name: e.target.value, existing_id: undefined } })
              }
              fullWidth
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
          {state.patient.existing_id && (
            <Alert severity="info">{t('orderCreate.patient.continuingExisting')}</Alert>
          )}
        </Stack>
      </CardContent>
      <Dialog open={matchOpen && !state.patient.existing_id} onClose={() => setMatchOpen(false)}>
        <DialogTitle>{t('orderCreate.patient.match.title')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('orderCreate.patient.match.body')}
          </Typography>
          {match && (
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
              {match.first_name} {match.last_name} · {match.date_of_birth}
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
    </Card>
  );
}

// ============================================================================
// Step 2 — Form
// ============================================================================
function FormStep({
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
  // Estimated total on this step ignores rush — the rush toggle lives on the
  // next step. Doctors get an updated estimate including rush there.
  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <OrderForm
            configuration={version.configuration_json}
            pricing={version.pricing_configuration_json}
            values={state.answers}
            onChange={(answers) => update({ answers })}
            showErrors={showErrors}
          />
        </CardContent>
      </Card>
      <PriceBreakdown
        pricing={version.pricing_configuration_json}
        answers={state.answers}
      />
    </Stack>
  );
}

// ============================================================================
// Step 4 — Files & Due
// ============================================================================
function FilesAndDueStep({
  state,
  update,
  locations,
  pricing,
  averageTurnaroundDays,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  locations: DoctorWorkLocationRow[];
  pricing: PricingConfig | undefined;
  averageTurnaroundDays: number | null;
}) {
  const { t } = useTranslation('doctor');

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
    if (
      state.requested_due_date &&
      dayjs(state.requested_due_date).isBefore(nextMin, 'day')
    ) {
      next.requested_due_date = '';
    }
    update(next);
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Stack>
            <Typography variant="h6">{t('orderCreate.filesAndDue.workLocation')}</Typography>
            <TextField
              select
              value={state.doctor_work_location_id}
              onChange={(e) => update({ doctor_work_location_id: e.target.value })}
              fullWidth
              sx={{ mt: 1 }}
            >
              {locations.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.clinic_name}
                  {l.branch_name ? ` · ${l.branch_name}` : ''} — {l.city}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="h6">{t('orderCreate.filesAndDue.rush')}</Typography>
            {rushAvailable ? (
              <>
                <FormControlLabel
                  control={
                    <Switch
                      checked={state.rush_requested}
                      onChange={(e) => handleRushToggle(e.target.checked)}
                    />
                  }
                  label={t('orderCreate.filesAndDue.rushToggle')}
                />
                <Stack
                  direction="row"
                  spacing={2}
                  flexWrap="wrap"
                  useFlexGap
                  alignItems="center"
                >
                  <Typography variant="body2" color="text.secondary">
                    {labRush!.type === 'PERCENTAGE'
                      ? t('orderCreate.filesAndDue.rushSurchargePercent', {
                          value: labRush!.value,
                        })
                      : t('orderCreate.filesAndDue.rushSurchargeFixed', {
                          amount: formatGEL(labRush!.value),
                        })}
                  </Typography>
                  {labRush!.turnaround_days != null && labRush!.turnaround_days > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      {labRush!.turnaround_days === 1
                        ? t('orderCreate.filesAndDue.rushTurnaroundOne')
                        : t('orderCreate.filesAndDue.rushTurnaroundOther', {
                            count: labRush!.turnaround_days,
                          })}
                    </Typography>
                  )}
                </Stack>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t('orderCreate.filesAndDue.rushUnavailable')}
              </Typography>
            )}
          </Stack>

          <Divider />

          <Stack spacing={1}>
            <DatePicker
              label={t('orderCreate.filesAndDue.dueDate')}
              value={state.requested_due_date ? dayjs(state.requested_due_date) : null}
              onChange={(d: Dayjs | null) =>
                update({
                  requested_due_date: d && d.isValid() ? d.format('YYYY-MM-DD') : '',
                })
              }
              format="YYYY-MM-DD"
              minDate={minDate}
              slotProps={{ textField: { fullWidth: true } }}
            />
            <Typography variant="caption" color="text.secondary">
              {t('orderCreate.filesAndDue.dueDateHint', { count: minDays })}
            </Typography>
          </Stack>

          <Divider />

          <Stack>
            <Typography variant="h6">{t('orderCreate.filesAndDue.files')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('orderCreate.filesAndDue.uploadHint')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              {t('orderCreate.filesAndDue.filesComingSoon')}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Step 5 — Review & Submit
// ============================================================================
function ReviewStep({
  state,
  update,
  version,
  locations,
  serviceName,
  labName,
  rush,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  version: LabFormVersionRow;
  locations: DoctorWorkLocationRow[];
  serviceName: string;
  labName: string;
  rush: { type: RushType; value: number } | undefined;
}) {
  const { t } = useTranslation('doctor');
  const loc = locations.find((l) => l.id === state.doctor_work_location_id);

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h6">{t('orderCreate.review.header')}</Typography>
          <Stack spacing={1} sx={{ mt: 2 }}>
            <Row k={t('orderCreate.review.fields.lab')} v={labName} />
            <Row k={t('orderCreate.review.fields.service')} v={serviceName} />
            <Row
              k={t('orderCreate.review.fields.patient')}
              v={`${state.patient.first_name} ${state.patient.last_name}`}
            />
            <Row
              k={t('orderCreate.review.fields.workLocation')}
              v={loc ? `${loc.clinic_name} — ${loc.city}` : ''}
            />
            <Row k={t('orderCreate.review.fields.dueDate')} v={state.requested_due_date || '—'} />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">{t('orderCreate.review.invoiceRecipient')}</Typography>
          <RadioGroup
            value={state.invoice_recipient_type}
            onChange={(e) =>
              update({ invoice_recipient_type: e.target.value as 'DOCTOR' | 'CLINIC' })
            }
          >
            <FormControlLabel value="DOCTOR" control={<Radio />} label={t('orderCreate.review.invoiceDoctor')} />
            <FormControlLabel value="CLINIC" control={<Radio />} label={t('orderCreate.review.invoiceClinic')} />
          </RadioGroup>
        </CardContent>
      </Card>

      <PriceBreakdown
        pricing={version.pricing_configuration_json}
        answers={state.answers}
        rush={rush}
        finalTotal={null}
      />

      {state.invoice_recipient_type === 'CLINIC' &&
        loc &&
        !loc.clinic_identification_code && (
          <Alert severity="warning">{t('orderCreate.review.clinicCodeWarning')}</Alert>
        )}
    </Stack>
  );
}

function Row({ k, v }: { k: string; v: string | undefined | null }) {
  return (
    <Stack direction="row" spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>
        {k}
      </Typography>
      <Typography variant="body2" sx={{ flex: 1 }}>
        {v || '—'}
      </Typography>
    </Stack>
  );
}
