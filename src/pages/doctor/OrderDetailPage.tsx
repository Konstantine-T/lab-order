import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { OrderForm } from '@/features/orderForms/OrderForm';
import type {
  LabFormVersionRow,
  OrderAnswerRow,
  OrderRow,
} from '@/types/database';

type DetailRow = OrderRow & {
  patients: { first_name: string; last_name: string; date_of_birth: string | null } | null;
};

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, patients(first_name, last_name, date_of_birth)')
        .eq('id', orderId!)
        .maybeSingle();
      if (error) throw error;
      return data as DetailRow | null;
    },
  });

  const { data: answers = [] } = useQuery({
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

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!order) return <Alert severity="error">{tc('errors.notFound')}</Alert>;

  const answersMap: Record<string, unknown> = {};
  for (const a of answers) answersMap[a.field_code] = a.answer_json;

  const labSnap = order.lab_snapshot as { public_name?: string };
  const serviceSnap = order.service_snapshot as { name?: string };
  const locSnap = order.work_location_snapshot as {
    clinic_name?: string;
    branch_name?: string;
    city?: string;
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      <Button component={RouterLink} to="/doctor/orders" size="small" sx={{ alignSelf: 'flex-start' }}>
        ← {t('orderDetail.back')}
      </Button>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <Typography variant="h4">{order.order_code}</Typography>
              <OrderStatusChip status={order.status} />
              <PaymentStatusChip status={order.payment_status} />
            </Stack>
            <Divider />
            <Row k={t('orderDetail.lab')} v={labSnap?.public_name} />
            <Row k={t('orderDetail.service')} v={serviceSnap?.name} />
            <Row
              k={t('orderDetail.patient')}
              v={
                order.patients
                  ? `${order.patients.first_name} ${order.patients.last_name}` +
                    (order.patients.date_of_birth ? ` · ${order.patients.date_of_birth}` : '')
                  : ''
              }
            />
            <Row
              k={t('orderDetail.workLocation')}
              v={`${locSnap?.clinic_name ?? ''}${locSnap?.branch_name ? ` · ${locSnap.branch_name}` : ''} — ${locSnap?.city ?? ''}`}
            />
            <Row
              k={order.confirmed_due_date
                ? t('orderDetail.confirmedDueDate')
                : t('orderDetail.dueDate')}
              v={order.confirmed_due_date ?? order.requested_due_date ?? '—'}
            />
            <Row
              k={t('orderDetail.createdAt')}
              v={dayjs(order.created_at).format('YYYY-MM-DD HH:mm')}
            />
          </Stack>
        </CardContent>
      </Card>

      {version && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('orderDetail.answers')}
            </Typography>
            <OrderForm
              configuration={version.configuration_json}
              pricing={version.pricing_configuration_json}
              values={answersMap}
              onChange={() => {}}
              readOnly
            />
            <Box sx={{ mt: 3 }}>
              <PriceBreakdown
                pricing={version.pricing_configuration_json}
                answers={answersMap}
                rush={{ type: order.rush_type, value: order.rush_value ?? 0 }}
                finalTotal={order.final_total}
              />
            </Box>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

function Row({ k, v }: { k: string; v: string | undefined | null }) {
  return (
    <Stack direction="row" spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160 }}>
        {k}
      </Typography>
      <Typography variant="body2" sx={{ flex: 1 }}>
        {v || '—'}
      </Typography>
    </Stack>
  );
}
