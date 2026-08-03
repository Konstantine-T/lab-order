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
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { EmptyState, Icon, PageHeader } from '@/components/design';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import { OrderRowCard } from '@/features/orders/OrderRowCard';
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
  const navigate = useNavigate();

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
