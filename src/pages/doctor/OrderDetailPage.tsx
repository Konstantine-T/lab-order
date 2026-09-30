import { Alert, Box, Button, CircularProgress, Stack } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { OrderCompletionActions } from '@/features/orders/completion/OrderCompletionActions';
import { Callout, Icon } from '@/components/design';
import { useContinueProject } from '@/features/doctor/orderCreate/useContinueProject';
import { OrderDetailView } from '@/features/orders/detail/OrderDetailView';
import { useOrderContacts } from '@/features/orders/detail/useOrderContacts';
import {
  DETAIL_ORDER_SELECT,
  isTerminal,
  type DetailOrder,
} from '@/features/orders/detail/types';
import type { LabFormVersionRow, OrderAnswerRow } from '@/types/database';

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const continueProject = useContinueProject();
  const qc = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(DETAIL_ORDER_SELECT)
        .eq('id', orderId!)
        .maybeSingle();
      if (error) throw error;
      return data as DetailOrder | null;
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

  // Staff names and the Telegram invite link, through the doctor-safe RPCs.
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

  const editable = !isTerminal(order);

  return (
    <OrderDetailView
      order={order}
      answers={answersMap}
      version={version}
      staff={staff}
      chatLink={chatLink}
      basePath="/doctor"
      ordersLabel={t('nav.orders')}
      onInvoiceAcknowledged={() => qc.invalidateQueries({ queryKey: ['order', order.id] })}
      actions={
        <>
          <OrderCompletionActions orderId={order.id} status={order.status} size="medium" />
          {order.status === 'COMPLETED' && (
            <Button
              variant="contained"
              startIcon={<Icon name="add" size={16} />}
              onClick={() => continueProject.start(order.lab_id, order.patient_id, order.id)}
            >
              {t('orders.continueProject')}
            </Button>
          )}
        </>
      }
      railFooter={
        <Stack spacing={1.5}>
          {/* Deliberately ungated by status, unlike "continue project" above:
              this is not the next phase of this case, it is a separate piece
              of work for the same patient, and the doctor has no reason to
              wait for this one to close before ordering it. `startForPatient`
              is the same launcher minus the lineage link, which is the only
              difference the two buttons have. */}
          <Button
            variant="outlined"
            fullWidth
            startIcon={<Icon name="add" size={16} />}
            onClick={() => continueProject.startForPatient(order.lab_id, order.patient_id)}
          >
            {t('orders.addAnotherService')}
          </Button>
          {editable && <Callout tone="brand">{t('orderDetail.editHint')}</Callout>}
        </Stack>
      }
    >
      {continueProject.modal}
    </OrderDetailView>
  );
}
