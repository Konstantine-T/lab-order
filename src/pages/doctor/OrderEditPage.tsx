import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { isOrderFormValid } from '@/features/orderForms/OrderForm';
import { calculatePrice, formatGEL } from '@/utils/pricing';
import { scrollToFirstError } from '@/features/orderForms/scrollToFirstError';
import { PatientStep, FormStep } from '@/pages/doctor/OrderCreateWizard';
import { initialState, type WizardState } from '@/features/doctor/orderCreate/types';
import type {
  DoctorWorkLocationRow,
  EditReasonCode,
  LabFormVersionRow,
  OrderAnswerRow,
  OrderRow,
} from '@/types/database';

type DetailRow = OrderRow & {
  patients: {
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    gender: string | null;
  } | null;
};

const EDIT_REASONS: EditReasonCode[] = [
  'CORRECTION',
  'UNFORESEEN_LAB_INSTRUCTION',
  'PATIENT_REASON',
  'CONSTRUCTION_DEFECT',
  'MY_MISTAKE',
  'UNFORESEEN_EVENT',
];

export function OrderEditPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const doctorId = user?.doctor_profile?.id;
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
        .select('*, patients(first_name, last_name, date_of_birth, gender)')
        .eq('id', orderId!)
        .maybeSingle();
      if (error) throw error;
      return data as DetailRow | null;
    },
  });

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
        p_patient: state.patient,
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
      qc.invalidateQueries({ queryKey: ['doctor-orders'] });
      qc.invalidateQueries({ queryKey: ['doctor-patient-orders'] });
      qc.invalidateQueries({ queryKey: ['lab-order', orderId] });
      qc.invalidateQueries({ queryKey: ['lab-orders'] });
      qc.invalidateQueries({ queryKey: ['lab-edited-orders'] });
      qc.invalidateQueries({ queryKey: ['lab-unreviewed-edits-count'] });
      qc.invalidateQueries({ queryKey: ['order-edits', orderId] });
      navigate(`/doctor/orders/${orderId}`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  const handleSave = () => {
    setError(null);
    setAttempted(true);
    if (!state.patient.first_name.trim() || !state.patient.last_name.trim()) {
      setError(tc('errors.required'));
      scrollToFirstError();
      return;
    }
    if (version && !isOrderFormValid(
      version.configuration_json,
      state.answers,
      version.pricing_configuration_json,
    )) {
      setError(tc('errors.required'));
      scrollToFirstError();
      return;
    }
    if (!state.doctor_work_location_id) {
      setError(tc('errors.required'));
      return;
    }
    if (!reason) {
      setError(t('orderEdit.reasonRequired'));
      return;
    }
    if (commentMissing) {
      setError(t('orderEdit.commentRequiredForUnforeseen'));
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
      <Stack spacing={2} sx={{ maxWidth: 600 }}>
        <Alert severity="error">{t('orderEdit.notEditable')}</Alert>
        <Button
          component={RouterLink}
          to={`/doctor/orders/${orderId}`}
          size="small"
          sx={{ alignSelf: 'flex-start' }}
        >
          ← {t('orderEdit.back')}
        </Button>
      </Stack>
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
    <Stack spacing={3} sx={{ maxWidth: 920, mx: 'auto' }}>
      <Button
        component={RouterLink}
        to={`/doctor/orders/${orderId}`}
        size="small"
        sx={{ alignSelf: 'flex-start' }}
      >
        ← {t('orderEdit.back')}
      </Button>

      <Typography variant="h4">
        {t('orderEdit.title')} · {order.order_code}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <PatientStep
        state={state}
        update={update}
        doctorId={doctorId ?? ''}
        patientAttempted={attempted}
      />

      {/* Work location + invoice recipient */}
      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Typography variant="h6">{t('orderCreate.filesAndDue.workLocation')}</Typography>
              {locations.length === 0 ? (
                <Alert severity="warning">{t('orderCreate.filesAndDue.noLocations')}</Alert>
              ) : (
                <TextField
                  select
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
            </Stack>

            <Stack spacing={1}>
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
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Dental form answers (editable) + live estimate */}
      {version && (
        <FormStep state={state} update={update} version={version} showErrors={attempted} />
      )}

      {/* Locked fields — shown so the doctor sees them but can't change them */}
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label={t('orderCreate.filesAndDue.dueDate')}
              value={order.requested_due_date ?? '—'}
              helperText={t('orderEdit.lockedDueDate')}
              fullWidth
              disabled
            />
            <TextField
              label={t('orderCreate.filesAndDue.rush')}
              value={rushText}
              helperText={t('orderEdit.lockedRush')}
              fullWidth
              disabled
            />
          </Stack>
        </CardContent>
      </Card>

      {/* Reason + comment */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">{t('orderEdit.reasonLabel')}</Typography>
            <TextField
              select
              required
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
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              error={attempted && commentMissing}
              helperText={commentRequired ? t('orderEdit.commentRequiredForUnforeseen') : undefined}
              multiline
              minRows={3}
              fullWidth
            />
          </Stack>
        </CardContent>
      </Card>

      <Alert severity="warning">{t('orderEdit.priceWarning')}</Alert>

      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={handleSave} disabled={save.isPending}>
          {t('orderEdit.save')}
        </Button>
      </Stack>
    </Stack>
  );
}
