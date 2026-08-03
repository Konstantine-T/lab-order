import { Box, CircularProgress, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { PageHeader, StatusPill } from '@/components/design';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { OrderStatusChip } from '@/components/OrderStatusChip';
import { formatGEL } from '@/utils/pricing';
import { OrderRowCard } from '@/features/orders/OrderRowCard';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import type { OrderRow } from '@/types/database';

type Row = OrderRow & {
  lab_services: { name: string } | null;
  service_snapshot: { name?: string } | null;
};

export function LabEditedOrdersPage() {
  const { t } = useTranslation('lab');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const navigate = useNavigate();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['lab-edited-orders', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_code, status, generated_total, final_total, requested_due_date, ' +
            'confirmed_due_date, created_at, service_snapshot, doctor_snapshot, ' +
            'has_unreviewed_edits, last_edited_at, edit_count, lab_services(name)',
        )
        .eq('lab_id', labId!)
        .gt('edit_count', 0)
        // Unconfirmed edits float to the top, but every edited order stays in
        // the list permanently.
        .order('has_unreviewed_edits', { ascending: false })
        .order('last_edited_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <>
      <PageHeader title={t('editedOrders.title')} subtitle={t('editedOrders.subtitle')} />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : orders.length === 0 ? (
        <OrdersEmptyState icon="difference" title={t('editedOrders.empty')} />
      ) : (
        <Stack spacing={1.25}>
          {orders.map((row) => {
            const ds = row.doctor_snapshot ?? {};
            const doctorName = [ds.first_name, ds.last_name].filter(Boolean).join(' ') || '—';
            const serviceName = row.lab_services?.name ?? row.service_snapshot?.name ?? '';
            const total = row.final_total ?? row.generated_total;
            const dueRaw = row.confirmed_due_date ?? row.requested_due_date;
            const due = dueRaw ? dayjs(dueRaw).format('MMM D') : undefined;
            return (
              <OrderRowCard
                key={row.id}
                code={row.order_code}
                primary={doctorName}
                secondary={serviceName}
                highlight={row.has_unreviewed_edits}
                flag={
                  row.has_unreviewed_edits ? (
                    <StatusPill tone="warning">{t('editedOrders.unconfirmedBadge')}</StatusPill>
                  ) : undefined
                }
                status={<OrderStatusChip status={row.status} />}
                total={total != null ? formatGEL(total) : '—'}
                dueDate={due}
                avatarText={doctorName}
                onClick={() => navigate(`/lab/orders/${row.id}`)}
              />
            );
          })}
        </Stack>
      )}
    </>
  );
}
