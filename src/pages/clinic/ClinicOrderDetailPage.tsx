import { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import { OrderForm } from '@/features/orderForms/OrderForm';
import { formatGEL } from '@/utils/pricing';
import type { LabFormVersionRow, OrderAnswerRow, OrderRow } from '@/types/database';

type DetailRow = OrderRow & {
  patients: { first_name: string; last_name: string; date_of_birth: string | null } | null;
};

function Row({ k, v }: { k: string; v: string | undefined | null }) {
  if (!v) return null;
  return (
    <Stack direction="row" spacing={2} justifyContent="space-between">
      <Typography variant="body2" color="text.secondary">
        {k}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: 'right' }}>
        {v}
      </Typography>
    </Stack>
  );
}

/**
 * Read-only order detail for a clinic admin — full order data of a doctor under
 * the clinic. Access is enforced by the clinic RLS SELECT policies on orders /
 * order_answers / patients (0013 migration); this page never writes.
 */
export function ClinicOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useTranslation('clinic');
  const { t: td } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');

  const { data: order, isLoading } = useQuery({
    queryKey: ['clinic-order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, patients(first_name, last_name, date_of_birth)')
        .eq('id', orderId!)
        .maybeSingle();
      if (error) throw error;
      return (data as DetailRow | null) ?? null;
    },
  });

  const { data: answers = [] } = useQuery({
    queryKey: ['clinic-order-answers', orderId],
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
      return (data as LabFormVersionRow | null) ?? null;
    },
  });

  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancelMut = useMutation({
    mutationFn: async () => {
      // Allowed by the orders_clinic_update RLS policy (0014) — the clinic can
      // cancel a linked doctor's non-terminal order.
      const { error } = await supabase
        .from('orders')
        .update({ status: 'CANCELLED', cancellation_reason: reason.trim() || null })
        .eq('id', orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      setCancelOpen(false);
      qc.invalidateQueries({ queryKey: ['clinic-order', orderId] });
      qc.invalidateQueries({ queryKey: ['clinic-orders'] });
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

  const labSnap = order.lab_snapshot as { public_name?: string } | null;
  const serviceSnap = order.service_snapshot as { name?: string } | null;
  const answersMap: Record<string, unknown> = {};
  for (const a of answers) answersMap[a.field_code] = a.answer_json;
  const total = order.final_total ?? order.generated_total;
  const isTerminal = order.status === 'COMPLETED' || order.status === 'CANCELLED';

  return (
    <Stack spacing={3}>
      <Button
        component={RouterLink}
        to="/clinic/orders"
        startIcon={<ArrowBackIcon />}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('orderDetail.back')}
      </Button>

      {order.status === 'CANCELLED' && (
        <Alert severity="error">
          <AlertTitle>{t('orderDetail.cancelledTitle')}</AlertTitle>
          {order.cancellation_reason || t('orderDetail.noReason')}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h5">{order.order_code}</Typography>
              <OrderStatusChip status={order.status} />
              <PaymentStatusChip status={order.payment_status} />
              {!isTerminal && (
                <Button
                  color="error"
                  variant="outlined"
                  size="small"
                  onClick={() => setCancelOpen(true)}
                  sx={{ ml: { sm: 'auto' } }}
                >
                  {t('orderDetail.cancelOrder')}
                </Button>
              )}
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
              k={order.confirmed_due_date ? t('orderDetail.confirmedDueDate') : t('orderDetail.dueDate')}
              v={order.confirmed_due_date ?? order.requested_due_date ?? '—'}
            />
            <Row k={t('orderDetail.total')} v={total != null ? formatGEL(total) : '—'} />
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
              {td('orderDetail.answers')}
            </Typography>
            <OrderForm
              configuration={version.configuration_json}
              pricing={version.pricing_configuration_json}
              values={answersMap}
              onChange={() => {}}
              readOnly
            />
          </CardContent>
        </Card>
      )}

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('orderDetail.cancel.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t('orderDetail.cancel.body')}</DialogContentText>
          <TextField
            label={t('orderDetail.cancel.reasonLabel')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)}>{tc('actions.close')}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => cancelMut.mutate()}
            disabled={cancelMut.isPending}
          >
            {t('orderDetail.cancel.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
