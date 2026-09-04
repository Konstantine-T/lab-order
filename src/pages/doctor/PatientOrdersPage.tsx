import { Box, Button, CircularProgress, Stack } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon, PageHeader } from '@/components/design';
import { useQuery } from '@tanstack/react-query';
import { useContinueProject } from '@/features/doctor/orderCreate/useContinueProject';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { OrderRowCard } from '@/features/orders/OrderRowCard';
import { LineageBadge } from '@/features/orders/LineageBadge';
import { useParentOrderCodes } from '@/features/orders/useParentOrderCodes';
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
  const continueProject = useContinueProject();

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
            'requested_due_date, confirmed_due_date, created_at, service_snapshot, lab_id, continues_order_id, ' +
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

  // Which lab a patient-level new order goes to: the one they most recently
  // ordered from (the query is created_at desc). With no orders there's no lab
  // to infer, so the button hides and the first order goes via the marketplace.
  const latestLabId = orders[0]?.lab_id;

  // Parent order codes for the continuation badges. Resolved from the rows
  // already loaded, with one batched query for any parent this page didn't
  // fetch — never a query per row.
  const parentCodes = useParentOrderCodes(orders);

  return (
    <>
      <PageHeader
        backTo="/doctor/patients"
        title={patientName}
        subtitle={t('patientOrders.title')}
        actions={
          latestLabId && patientId ? (
            <Button
              variant="contained"
              startIcon={<Icon name="add" size={18} />}
              onClick={() => continueProject.startForPatient(latestLabId, patientId)}
            >
              {t('orders.addNewOrder')}
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : orders.length === 0 ? (
        <OrdersEmptyState title={t('patientOrders.empty')} />
      ) : (
        <Stack spacing={1.25}>
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
            const due = dueRaw ? dayjs(dueRaw).format('MMM D') : undefined;
            return (
              <OrderRowCard
                key={row.id}
                lineage={
                  <LineageBadge
                    continuesOrderId={row.continues_order_id}
                    parentCode={parentCodes.get(row.continues_order_id ?? '')}
                  />
                }
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
                  row.status === 'CANCELLED' ? undefined : (
                    <Stack direction="row" spacing={1} sx={{ px: 2.5, py: 1.25 }}>
                      {row.status !== 'COMPLETED' && (
                        <Button
                          size="small"
                          startIcon={<Icon name="edit" size={16} />}
                          onClick={() => navigate(`/doctor/orders/${row.id}/edit`)}
                        >
                          {t('orders.editButton')}
                        </Button>
                      )}
                      {patientId && (
                        <Button
                          size="small"
                          startIcon={<Icon name="add" size={16} />}
                          onClick={() => continueProject.startForPatient(row.lab_id, patientId)}
                        >
                          {t('orders.addAnotherService')}
                        </Button>
                      )}
                      {row.status === 'COMPLETED' && patientId && (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Icon name="add" size={16} />}
                          onClick={() => continueProject.start(row.lab_id, patientId, row.id)}
                        >
                          {t('orders.continueProject')}
                        </Button>
                      )}
                    </Stack>
                  )
                }
              />
            );
          })}
        </Stack>
      )}
      {continueProject.modal}
    </>
  );
}
