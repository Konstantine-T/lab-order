import { useEffect, useState } from 'react';
import {
  Alert,
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
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { type Dayjs } from 'dayjs';
import { supabase } from '@/lib/supabase';
import { formatGEL } from '@/utils/pricing';
import { OrderStatusChip } from '@/components/OrderStatusChip';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { OrderForm } from '@/features/orderForms/OrderForm';
import { PillGroup } from '@/features/orderForms/primitives';
import type {
  LabFormVersionRow,
  OrderAnswerRow,
  OrderRow,
  OrderStatus,
} from '@/types/database';
import { LAB_SELECTABLE_STATUSES } from '@/types/database';

type DetailRow = OrderRow;

export function LabOrderSheetPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();

  const [finalPrice, setFinalPrice] = useState<string>('');
  const [confirmedDue, setConfirmedDue] = useState<string>('');
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | ''>('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: order, isLoading } = useQuery({
    queryKey: ['lab-order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
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

  useEffect(() => {
    if (order) {
      setFinalPrice(order.final_total?.toString() ?? '');
      setConfirmedDue(order.confirmed_due_date ?? '');
      setPendingStatus(order.status);
    }
  }, [order]);

  const update = useMutation({
    mutationFn: async (patch: Partial<OrderRow>) => {
      if (!orderId) return;
      const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      setSuccess('Saved.');
      qc.invalidateQueries({ queryKey: ['lab-order', orderId] });
      qc.invalidateQueries({ queryKey: ['lab-orders'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  const cancel = useMutation({
    mutationFn: async (reason: string) => {
      if (!orderId) return;
      const { error } = await supabase
        .from('orders')
        .update({ status: 'CANCELLED', cancellation_reason: reason })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      setCancelOpen(false);
      setCancelReason('');
      setSuccess(t('orderSheet.cancelModal.success'));
      qc.invalidateQueries({ queryKey: ['lab-order', orderId] });
      qc.invalidateQueries({ queryKey: ['lab-orders'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!order) return <Alert severity="error">{tc('errors.notFound')}</Alert>;

  const isTerminal = order.status === 'COMPLETED' || order.status === 'CANCELLED';

  const answersMap: Record<string, unknown> = {};
  for (const a of answers) answersMap[a.field_code] = a.answer_json;

  const doctor = order.doctor_snapshot ?? {};
  const doctorFullName = [doctor.first_name, doctor.last_name].filter(Boolean).join(' ');
  const labSnap = order.lab_snapshot as { public_name?: string };
  const serviceSnap = order.service_snapshot as { name?: string };

  return (
    <Stack spacing={3} sx={{ maxWidth: 920 }}>
      <Button component={RouterLink} to="/lab/orders" size="small" sx={{ alignSelf: 'flex-start' }}>
        ← {t('orderSheet.back')}
      </Button>

      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <Typography variant="h4">{order.order_code}</Typography>
              <OrderStatusChip status={order.status} />
            </Stack>
            <Divider />
            <Row k={t('orderSheet.doctor')} v={doctorFullName} />
            <Row k={t('orderSheet.doctorPhone')} v={doctor.phone ?? ''} />
            <Row k={t('orderSheet.service')} v={serviceSnap?.name} />
            <Row k="Lab" v={labSnap?.public_name} />
            <Row
              k={order.confirmed_due_date
                ? t('orderSheet.confirmedDueDate')
                : t('orderSheet.dueDate')}
              v={order.confirmed_due_date ?? order.requested_due_date ?? '—'}
            />
            <Row
              k={t('orderSheet.createdAt')}
              v={dayjs(order.created_at).format('YYYY-MM-DD HH:mm')}
            />
            <Divider />
            <PillGroup
              value={pendingStatus}
              onChange={(s) => setPendingStatus(s)}
              options={LAB_SELECTABLE_STATUSES}
              getLabel={(s) => tc(`orderStatus.${s}`)}
            />
            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              {!isTerminal && (
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={() => setCancelOpen(true)}
                >
                  {t('orderSheet.cancelOrder')}
                </Button>
              )}
              <Button
                variant="contained"
                size="small"
                disabled={
                  update.isPending ||
                  !pendingStatus ||
                  pendingStatus === order.status ||
                  isTerminal
                }
                onClick={() => pendingStatus && update.mutate({ status: pendingStatus })}
              >
                {tc('actions.save')}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {version && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('orderSheet.answers')}
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

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('orderSheet.actions')}
          </Typography>
          <Stack spacing={3}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
              <TextField
                type="number"
                label={t('orderSheet.finalPriceLabel')}
                value={finalPrice}
                onChange={(e) => setFinalPrice(e.target.value)}
                size="small"
                helperText={
                  order.generated_total != null
                    ? t('orderSheet.finalPriceMin', {
                        min: formatGEL(order.generated_total * 0.5),
                      })
                    : undefined
                }
              />
              <Button
                variant="outlined"
                onClick={() => {
                  if (finalPrice !== '' && order.generated_total != null) {
                    const amount = Number(finalPrice);
                    const floor = order.generated_total * 0.5;
                    if (amount < floor) {
                      setError(
                        t('orderSheet.finalPriceTooLow', {
                          min: formatGEL(floor),
                        }),
                      );
                      return;
                    }
                  }
                  update.mutate({
                    final_total: finalPrice === '' ? null : Number(finalPrice),
                  });
                }}
                disabled={update.isPending}
                sx={{ mt: { xs: 0, sm: '4px' } }}
              >
                {t('orderSheet.setFinalPrice')}
              </Button>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <DatePicker
                label={t('orderSheet.confirmedDueDate')}
                value={confirmedDue ? dayjs(confirmedDue) : null}
                onChange={(d: Dayjs | null) =>
                  setConfirmedDue(d && d.isValid() ? d.format('YYYY-MM-DD') : '')
                }
                format="YYYY-MM-DD"
                slotProps={{ textField: { size: 'small' } }}
              />
              <Button
                variant="outlined"
                onClick={() =>
                  update.mutate({ confirmed_due_date: confirmedDue || null })
                }
                disabled={update.isPending}
              >
                {t('orderSheet.confirmDue')}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack>
              <Typography variant="h6">{t('orderSheet.statusTitle')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('orderSheet.statusHelp')}
              </Typography>
            </Stack>
            <PillGroup
              value={pendingStatus}
              onChange={(s) => setPendingStatus(s)}
              options={LAB_SELECTABLE_STATUSES}
              getLabel={(s) => tc(`orderStatus.${s}`)}
            />
            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              {!isTerminal && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => setCancelOpen(true)}
                >
                  {t('orderSheet.cancelOrder')}
                </Button>
              )}
              <Button
                variant="contained"
                disabled={
                  update.isPending ||
                  !pendingStatus ||
                  pendingStatus === order.status ||
                  isTerminal
                }
                onClick={() =>
                  pendingStatus && update.mutate({ status: pendingStatus })
                }
              >
                {tc('actions.save')}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('orderSheet.cancelModal.title')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <DialogContentText>{t('orderSheet.cancelModal.body')}</DialogContentText>
            <TextField
              label={t('orderSheet.cancelModal.reasonLabel')}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              multiline
              minRows={3}
              fullWidth
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)} color="inherit">
            {t('orderSheet.cancelModal.keep')}
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={!cancelReason.trim() || cancel.isPending}
            onClick={() => cancel.mutate(cancelReason.trim())}
          >
            {t('orderSheet.cancelModal.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
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
