import { useState } from 'react';
import {
  Alert,
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
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { OrderCompletionActions } from '@/features/orders/completion/OrderCompletionActions';
import { OrderDetailView } from '@/features/orders/detail/OrderDetailView';
import { useOrderContacts } from '@/features/orders/detail/useOrderContacts';
import {
  DETAIL_ORDER_SELECT,
  isTerminal,
  type DetailOrder,
} from '@/features/orders/detail/types';
import type { LabFormVersionRow, OrderAnswerRow } from '@/types/database';

/**
 * Order detail for a clinic admin — full order data of a doctor under the
 * clinic, on the same screen the doctor sees. Reads are enforced by the clinic
 * RLS SELECT policies on orders / order_answers / patients (0013); the writes
 * it offers — edit, answer, complete, cancel — are each authorized server-side
 * by can_act_for_doctor, exactly as for the doctor themselves.
 */
export function ClinicOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useTranslation('clinic');
  const { t: tc } = useTranslation('common');

  const { data: order, isLoading } = useQuery({
    queryKey: ['clinic-order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(DETAIL_ORDER_SELECT)
        .eq('id', orderId!)
        .maybeSingle();
      if (error) throw error;
      return (data as DetailOrder | null) ?? null;
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

  // The same doctor-safe views the doctor reads (names only, invite link
  // only). Both RPCs admit the clinic admin via can_act_for_doctor (0041);
  // with no staff assigned or no chat created yet they return empty rows, and
  // the staff line and chat button simply do not appear.
  const { staff, chatLink } = useOrderContacts(orderId);

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

  const answersMap: Record<string, unknown> = {};
  for (const a of answers) answersMap[a.field_code] = a.answer_json;

  return (
    <OrderDetailView
      order={order}
      answers={answersMap}
      version={version}
      staff={staff}
      chatLink={chatLink}
      basePath="/clinic"
      ordersLabel={t('nav.orders')}
      doctorOnPhone
      onInvoiceAcknowledged={() => qc.invalidateQueries({ queryKey: ['clinic-order', orderId] })}
      // Ungated by status: a completed case still needs its "reopen" escape
      // hatch.
      actions={<OrderCompletionActions orderId={order.id} status={order.status} size="medium" />}
      railFooter={
        !isTerminal(order) ? (
          <Button color="error" variant="outlined" fullWidth onClick={() => setCancelOpen(true)}>
            {t('orderDetail.cancelOrder')}
          </Button>
        ) : undefined
      }
    >
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
    </OrderDetailView>
  );
}
