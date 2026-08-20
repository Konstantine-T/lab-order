import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  Callout,
  CardStack,
  FieldLabel,
  Icon,
  PageHeader,
  SectionCard,
  Segmented,
} from '@/components/design';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { isOrderFormValid } from '@/features/orderForms/OrderForm';
import { PatientStep, FormStep } from '@/pages/doctor/OrderCreateWizard';
import { useAuth } from '@/auth/AuthProvider';
import { PendingOrderFilesField } from '@/features/orders/orderFiles/OrderFilesField';
import { uploadOrderFile } from '@/features/orders/orderFiles/orderFilesApi';
import { initialState, type WizardState } from '@/features/doctor/orderCreate/types';
import { calculatePrice } from '@/utils/pricing';
import { scrollToFirstError } from '@/features/orderForms/scrollToFirstError';
import type {
  ClinicDoctorRow,
  DoctorWorkLocationRow,
  LabFormVersionRow,
} from '@/types/database';

type OrderableService = {
  id: string;
  name: string;
  lab_forms: { id: string; status: string; current_version_id: string | null } | null;
};

/**
 * Clinic admin creates an order ON BEHALF OF one of its linked doctors. The
 * doctor picker + lab/service picker feed the same PatientStep / FormStep the
 * doctor uses; submit goes through clinic_submit_order (0014), which re-checks
 * the doctor↔clinic link server-side and attributes the order to that doctor.
 */
export function ClinicOrderCreatePage() {
  const { t } = useTranslation('clinic');
  const { t: td } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [doctorId, setDoctorId] = useState('');
  const [labId, setLabId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [state, setState] = useState<WizardState>(initialState);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okId, setOkId] = useState<string | null>(null);

  const update = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));

  const { data: doctors = [] } = useQuery({
    queryKey: ['clinic-doctors'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('clinic_doctors');
      if (error) throw error;
      return (data ?? []) as ClinicDoctorRow[];
    },
  });

  const { data: labs = [] } = useQuery({
    queryKey: ['clinic-orderable-labs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labs')
        .select('id, public_name')
        .eq('approval_status', 'APPROVED_ACTIVE')
        .eq('is_active', true)
        .order('public_name');
      if (error) throw error;
      return (data ?? []) as { id: string; public_name: string }[];
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ['clinic-orderable-services', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_services')
        .select('id, name, lab_forms!lab_services_linked_form_fk(id, status, current_version_id)')
        .eq('lab_id', labId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as OrderableService[];
    },
  });

  const selectedService = services.find((s) => s.id === serviceId);
  const versionId =
    selectedService?.lab_forms?.status === 'PUBLISHED'
      ? selectedService.lab_forms.current_version_id
      : null;

  const { data: version } = useQuery({
    queryKey: ['clinic-order-version', versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_form_versions')
        .select('*')
        .eq('id', versionId!)
        .maybeSingle();
      if (error) throw error;
      return data as LabFormVersionRow | null;
    },
  });

  // The acting doctor's work locations — clinic reads them via work_locations_clinic_select (0014).
  const { data: locations = [] } = useQuery({
    queryKey: ['clinic-doctor-locations', doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_work_locations')
        .select('*')
        .eq('doctor_id', doctorId)
        .is('archived_at', null)
        .order('is_default', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DoctorWorkLocationRow[];
    },
  });

  // Keep wizard state's lab/service in sync; reset service when the lab changes.
  useEffect(() => {
    update({ lab_id: labId, lab_service_id: serviceId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labId, serviceId]);
  useEffect(() => {
    setServiceId('');
  }, [labId]);
  // Reset the picked location + default to the first when the doctor changes.
  useEffect(() => {
    update({ doctor_work_location_id: locations[0]?.id ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  const generatedTotal = useMemo(() => {
    if (!version) return null;
    const r = calculatePrice(version.pricing_configuration_json, state.answers, {
      type: 'NONE',
      value: 0,
    });
    return r.kind === 'CALCULATED' ? r.total : null;
  }, [version, state.answers]);

  // Same model as the doctor wizard: picked now, uploaded once the order id
  // exists. Clinic RLS (migration 0021) authorizes the clinic admin.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [failedUploads, setFailedUploads] = useState<string[]>([]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!version) throw new Error('No form version');
      const { data, error } = await supabase.rpc('clinic_submit_order', {
        p_doctor_id: doctorId,
        p_lab_id: labId,
        p_lab_service_id: serviceId,
        p_doctor_work_location_id: state.doctor_work_location_id,
        p_patient: state.patient,
        p_lab_form_version_id: version.id,
        p_invoice_recipient_type: state.invoice_recipient_type,
        p_requested_due_date: state.requested_due_date || null,
        p_rush_type: 'NONE',
        p_rush_value: null,
        p_answers: state.answers,
        p_generated_total: generatedTotal,
      });
      if (error) throw error;
      const orderId = data as string;

      // Non-fatal: the order is placed, so a failed attachment is reported
      // rather than thrown.
      if (pendingFiles.length > 0 && user) {
        const failed: string[] = [];
        for (const f of pendingFiles) {
          try {
            await uploadOrderFile({ id: orderId, lab_id: labId }, f, user.id, user.role);
          } catch {
            failed.push(f.name);
          }
        }
        if (failed.length) setFailedUploads(failed);
      }
      return orderId;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['clinic-orders'] });
      setOkId(id);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  const handleSubmit = () => {
    setError(null);
    setAttempted(true);
    if (!doctorId) return setError(t('orderCreate.pickDoctor'));
    if (!version) return setError(t('orderCreate.pickService'));
    if (!state.patient.first_name.trim() || !state.patient.last_name.trim()) {
      setError(tc('errors.required'));
      return scrollToFirstError();
    }
    if (
      !isOrderFormValid(version.configuration_json, state.answers, version.pricing_configuration_json)
    ) {
      setError(tc('errors.required'));
      return scrollToFirstError();
    }
    if (!state.doctor_work_location_id) return setError(tc('errors.required'));
    if (!state.requested_due_date) return setError(tc('errors.required'));
    submit.mutate();
  };

  if (okId) {
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
          {t('orderCreate.success')}
        </Typography>
        {failedUploads.length > 0 && (
          <Callout tone="warning">
            {tc('orderFiles.errors.partialSubmit', { names: failedUploads.join(', ') })}
          </Callout>
        )}
        <Stack direction="row" spacing={1.5} sx={{ pt: 1 }}>
          <Button variant="contained" onClick={() => navigate(`/clinic/orders/${okId}`)}>
            {tc('actions.viewDetails')}
          </Button>
          <Button variant="outlined" onClick={() => navigate('/clinic/orders')}>
            {t('orderDetail.back')}
          </Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <>
      <PageHeader backTo="/clinic/orders" title={t('orderCreate.title')} />

      <CardStack>
      {error && <Alert severity="error">{error}</Alert>}

      <SectionCard icon="assignment" title={t('orderCreate.title')}>
          <Stack spacing={2.5}>
            <FormControl fullWidth error={attempted && !doctorId}>
              <InputLabel>{t('orderCreate.doctor')}</InputLabel>
              <Select
                label={t('orderCreate.doctor')}
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
              >
                {doctors.map((d) => (
                  <MenuItem key={d.doctor_id} value={d.doctor_id}>
                    {d.first_name} {d.last_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>{t('orderCreate.lab')}</InputLabel>
              <Select label={t('orderCreate.lab')} value={labId} onChange={(e) => setLabId(e.target.value)}>
                {labs.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.public_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={!labId}>
              <InputLabel>{t('orderCreate.service')}</InputLabel>
              <Select
                label={t('orderCreate.service')}
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                {services
                  .filter((s) => s.lab_forms?.status === 'PUBLISHED')
                  .map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Stack>
      </SectionCard>

      {doctorId && version && (
        <>
          <PatientStep state={state} update={update} doctorId={doctorId} patientAttempted={attempted} />

          <SectionCard icon="location_on" title={td('orderCreate.filesAndDue.workLocation')}>
              <Stack spacing={2.5}>
                <Box>
                  {locations.length === 0 ? (
                    <Callout tone="warning">{t('orderCreate.noLocations')}</Callout>
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
                </Box>

                <Box>
                  <FieldLabel sx={{ mb: 0.75 }}>
                    {td('orderCreate.review.invoiceRecipient')}
                  </FieldLabel>
                  <Segmented
                    value={state.invoice_recipient_type}
                    onChange={(v) => update({ invoice_recipient_type: v })}
                    options={[
                      { value: 'DOCTOR' as const, label: td('orderCreate.review.invoiceDoctor') },
                      { value: 'CLINIC' as const, label: td('orderCreate.review.invoiceClinic') },
                    ]}
                    sx={{ maxWidth: 360 }}
                  />
                </Box>

                <Box>
                  <FieldLabel sx={{ mb: 0.75 }}>
                    {td('orderCreate.filesAndDue.dueDate')}
                  </FieldLabel>
                  <DatePicker
                    value={state.requested_due_date ? dayjs(state.requested_due_date) : null}
                    onChange={(d) => update({ requested_due_date: d ? d.format('YYYY-MM-DD') : '' })}
                    minDate={dayjs().add(1, 'day')}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Box>
              </Stack>
          </SectionCard>

          <FormStep state={state} update={update} version={version} showErrors={attempted} />

          <SectionCard icon="upload_file" title={tc('orderFiles.title')}>
            <PendingOrderFilesField
              files={pendingFiles}
              onChange={setPendingFiles}
              disabled={submit.isPending}
            />
          </SectionCard>

          <Stack direction="row" justifyContent="flex-end">
            <Button
              variant="contained"
              size="large"
              onClick={handleSubmit}
              disabled={submit.isPending}
            >
              {t('orderCreate.submit')}
            </Button>
          </Stack>
        </>
      )}
      </CardStack>
    </>
  );
}
