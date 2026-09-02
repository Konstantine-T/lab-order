import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { EmptyState, Icon, PageHeader } from '@/components/design';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import { OrderRowCard } from '@/features/orders/OrderRowCard';
import { clearDraft, loadDraftsByAuthor } from '@/features/doctor/orderCreate/draftStorage';
import { formatGEL } from '@/utils/pricing';
import type { ClinicDoctorRow, OrderRow } from '@/types/database';

type ClinicOrderRow = OrderRow & {
  patients: { first_name: string; last_name: string } | null;
  labs: { public_name: string } | null;
  lab_services: { name: string } | null;
};

export function ClinicOrdersPage() {
  const { t } = useTranslation('clinic');
  const { user } = useAuth();
  const clinicId = user?.clinic?.id;
  const authorUserId = user?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [doctorFilter, setDoctorFilter] = useState<string>('ALL');

  const { data: doctors = [] } = useQuery({
    queryKey: ['clinic-doctors', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('clinic_doctors');
      if (error) throw error;
      return (data ?? []) as ClinicDoctorRow[];
    },
  });

  // RLS returns only orders whose doctor is under this clinic — no client filter needed.
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['clinic-orders', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_code, doctor_id, status, payment_status, generated_total, final_total, requested_due_date, confirmed_due_date, created_at, patients(first_name, last_name), labs(public_name), lab_services(name)',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClinicOrderRow[];
    },
  });

  // Unfinished orders. The admin autosaves a draft per doctor they order for,
  // and without this the only way back into one is to retrace the same lab and
  // service by hand — the doctor's own orders list has surfaced theirs since
  // drafts existed.
  const { data: drafts = [] } = useQuery({
    queryKey: ['clinic-drafts', authorUserId],
    enabled: !!authorUserId,
    queryFn: () => loadDraftsByAuthor(authorUserId!),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const discardDraft = async (doctorId: string) => {
    if (!authorUserId) return;
    await clearDraft(doctorId, authorUserId);
    await queryClient.invalidateQueries({ queryKey: ['clinic-drafts', authorUserId] });
  };

  const doctorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of doctors) m.set(d.doctor_id, `${d.first_name} ${d.last_name}`);
    return m;
  }, [doctors]);

  const visible =
    doctorFilter === 'ALL' ? orders : orders.filter((o) => o.doctor_id === doctorFilter);

  return (
    <>
      <PageHeader
        title={t('orders.title')}
        subtitle={t('orders.subtitle')}
        actions={
          <>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>{t('orders.filterByDoctor')}</InputLabel>
              <Select
                label={t('orders.filterByDoctor')}
                value={doctorFilter}
                onChange={(e) => setDoctorFilter(e.target.value)}
              >
                <MenuItem value="ALL">{t('orders.allDoctors')}</MenuItem>
                {doctors.map((d) => (
                  <MenuItem key={d.doctor_id} value={d.doctor_id}>
                    {d.first_name} {d.last_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<Icon name="add" size={17} />}
              onClick={() => navigate('/clinic/orders/new')}
              sx={{ flexShrink: 0 }}
            >
              {t('orders.newOrder')}
            </Button>
          </>
        }
      />

      {drafts.length > 0 && (
        <Stack spacing={1.25} sx={{ mb: 2 }}>
          {drafts.map((d) => {
            const patient = `${d.state.patient.first_name} ${d.state.patient.last_name}`.trim();
            return (
              <Stack
                key={d.doctorId}
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
                    {t('orders.draft.bannerTitle', {
                      doctor: doctorName.get(d.doctorId) ?? '',
                    })}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {[patient, d.labName, d.serviceName].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() =>
                    navigate(
                      `/clinic/orders/new?doctor=${d.doctorId}&lab=${d.state.lab_id}&service=${d.state.lab_service_id}`,
                    )
                  }
                >
                  {t('orders.draft.resume')}
                </Button>
                <Button size="small" color="inherit" onClick={() => discardDraft(d.doctorId)}>
                  {t('orders.draft.discard')}
                </Button>
              </Stack>
            );
          })}
        </Stack>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : visible.length === 0 ? (
        <EmptyState icon="inbox" title={t('orders.empty')} minHeight={240} />
      ) : (
        <Stack spacing={1.25}>
          {visible.map((o) => {
            const patient = o.patients
              ? `${o.patients.first_name} ${o.patients.last_name}`
              : '—';
            const total = o.final_total ?? o.generated_total;
            return (
              <OrderRowCard
                key={o.id}
                code={o.order_code}
                primary={patient}
                secondary={[o.lab_services?.name, o.labs?.public_name, doctorName.get(o.doctor_id)]
                  .filter(Boolean)
                  .join(' · ')}
                status={<OrderStatusChip status={o.status} />}
                paymentStatus={<PaymentStatusChip status={o.payment_status} />}
                total={total != null ? formatGEL(total) : '—'}
                dueDate={o.confirmed_due_date ?? o.requested_due_date ?? undefined}
                avatarText={patient}
                onClick={() => navigate(`/clinic/orders/${o.id}`)}
              />
            );
          })}
        </Stack>
      )}
    </>
  );
}
