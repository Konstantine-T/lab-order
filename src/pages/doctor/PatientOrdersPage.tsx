import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { Link as RouterLink, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { OrderRowCard } from '@/features/orders/OrderRowCard';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import { formatGEL } from '@/utils/pricing';
import type { OrderRow, PatientRow } from '@/types/database';

type OrderRow_ = OrderRow & {
  labs: { public_name: string } | null;
  lab_services: { name: string } | null;
  service_snapshot: { name?: string } | null;
};

export function PatientOrdersPage() {
  const { t } = useTranslation('doctor');
  const { user } = useAuth();
  const doctorId = user?.doctor_profile?.id;
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();

  const { data: patient } = useQuery({
    queryKey: ['doctor-patient', patientId],
    enabled: !!patientId && !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('id, first_name, last_name')
        .eq('id', patientId!)
        .eq('doctor_id', doctorId!)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<PatientRow, 'id' | 'first_name' | 'last_name'> | null;
    },
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['doctor-patient-orders', patientId],
    enabled: !!patientId && !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_code, status, payment_status, generated_total, final_total, ' +
            'requested_due_date, confirmed_due_date, created_at, service_snapshot, ' +
            'labs(public_name), lab_services(name)',
        )
        .eq('doctor_id', doctorId!)
        .eq('patient_id', patientId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow_[];
    },
  });

  const patientName = patient
    ? `${patient.first_name} ${patient.last_name}`
    : '…';

  return (
    <Stack spacing={3}>
      <Button
        component={RouterLink}
        to="/doctor/patients"
        size="small"
        sx={{ alignSelf: 'flex-start' }}
      >
        ← {t('patientOrders.back')}
      </Button>

      <Stack>
        <Typography variant="h4" fontWeight={600}>
          {patientName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('patientOrders.title')}
        </Typography>
      </Stack>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : orders.length === 0 ? (
        <OrdersEmptyState title={t('patientOrders.empty')} />
      ) : (
        <Stack spacing={1.5}>
          {orders.map((row) => {
            const serviceName =
              row.lab_services?.name ?? row.service_snapshot?.name ?? '';
            const labName = row.labs?.public_name ?? '';
            const hasDiscount =
              row.final_total != null &&
              row.generated_total != null &&
              row.final_total < row.generated_total;
            const total = row.final_total ?? row.generated_total;
            const dueRaw = row.confirmed_due_date ?? row.requested_due_date;
            const due = dueRaw
              ? t('orders.dueOn', { date: dayjs(dueRaw).format('MMM D, YYYY') })
              : undefined;
            return (
              <OrderRowCard
                key={row.id}
                code={row.order_code}
                primary={serviceName || '—'}
                secondary={labName}
                status={<OrderStatusChip status={row.status} />}
                paymentStatus={<PaymentStatusChip status={row.payment_status} />}
                total={total != null ? formatGEL(total) : '—'}
                originalTotal={hasDiscount ? formatGEL(row.generated_total!) : undefined}
                dueDate={due}
                avatarText={serviceName || '?'}
                onClick={() => navigate(`/doctor/orders/${row.id}`)}
                footer={
                  row.status !== 'COMPLETED' && row.status !== 'CANCELLED' ? (
                    <Box sx={{ px: 2.5, py: 1.25 }}>
                      <Button
                        size="small"
                        startIcon={<EditIcon fontSize="small" />}
                        onClick={() => navigate(`/doctor/orders/${row.id}/edit`)}
                      >
                        {t('orders.editButton')}
                      </Button>
                    </Box>
                  ) : undefined
                }
              />
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
