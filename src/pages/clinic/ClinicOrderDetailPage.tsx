import { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { CardStack, FactCell, Icon, PageHeader, SectionCard } from '@/components/design';
import { OrderFilesField } from '@/features/orders/orderFiles/OrderFilesField';
import { OrderCompletionActions } from '@/features/orders/completion/OrderCompletionActions';
import { ClarificationPanel } from '@/features/orders/clarifications/ClarificationPanel';
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
    <>
      <PageHeader
        backTo="/clinic/orders"
        title={order.order_code}
        subtitle={[
          order.patients ? `${order.patients.first_name} ${order.patients.last_name}` : null,
          serviceSnap?.name,
        ]
          .filter(Boolean)
          .join(' · ')}
        chips={
          <>
            <OrderStatusChip status={order.status} />
            <PaymentStatusChip status={order.payment_status} />
          </>
        }
        actions={
          <>
            {!isTerminal && (
              <>
                <Button
                  component={RouterLink}
                  to={`/clinic/orders/${order.id}/edit`}
                  variant="outlined"
                  size="small"
                  startIcon={<Icon name="edit" size={16} />}
                >
                  {tc('actions.edit')}
                </Button>
                <Button
                  color="error"
                  variant="outlined"
                  size="small"
                  onClick={() => setCancelOpen(true)}
                >
                  {t('orderDetail.cancelOrder')}
                </Button>
              </>
            )}
            {/* Outside the !isTerminal gate on purpose: a completed case still
                needs its "reopen" escape hatch. */}
            <OrderCompletionActions orderId={order.id} status={order.status} />
          </>
        }
      />

      <CardStack>
      {order.status === 'CANCELLED' && (
        <Alert severity="error">
          <AlertTitle>{t('orderDetail.cancelledTitle')}</AlertTitle>
          {order.cancellation_reason || t('orderDetail.noReason')}
        </Alert>
      )}

      {/* A clinic admin answers on behalf of its doctor — can_act_for_doctor
          authorizes it server-side, exactly as for edits and completion. */}
      <ClarificationPanel orderId={order.id} canAnswer={!isTerminal} />

      <SectionCard>
        <Box
          sx={{
            display: 'grid',
            gap: 1.75,
            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          }}
        >
          <FactCell label={t('orderDetail.lab')} value={labSnap?.public_name ?? '—'} />
          <FactCell label={t('orderDetail.service')} value={serviceSnap?.name ?? '—'} />
          <FactCell
            label={t('orderDetail.patient')}
            value={
              order.patients
                ? `${order.patients.first_name} ${order.patients.last_name}`
                : '—'
            }
            hint={order.patients?.date_of_birth ?? undefined}
          />
          <FactCell
            label={
              order.confirmed_due_date
                ? t('orderDetail.confirmedDueDate')
                : t('orderDetail.dueDate')
            }
            value={order.confirmed_due_date ?? order.requested_due_date ?? '—'}
          />
          <FactCell
            label={t('orderDetail.total')}
            value={total != null ? formatGEL(total) : '—'}
          />
          <FactCell
            label={t('orderDetail.createdAt')}
            value={dayjs(order.created_at).format('YYYY-MM-DD')}
            hint={dayjs(order.created_at).format('HH:mm')}
          />
        </Box>
      </SectionCard>

      {/* Not gated on `version` — attachments exist whether or not the form
          version loaded. */}
      <SectionCard icon="upload_file" title={tc('orderFiles.title')}>
        <OrderFilesField orderId={order.id} labId={order.lab_id} />
      </SectionCard>

      {version && (
        <SectionCard icon="assignment" title={td('orderDetail.answers')}>
          <OrderForm
            configuration={version.configuration_json}
            pricing={version.pricing_configuration_json}
            values={answersMap}
            onChange={() => {}}
            readOnly
          />
        </SectionCard>
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
      </CardStack>
    </>
  );
}
