import { Alert, Box, Button, CircularProgress, Stack } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { PURCHASE_PATHS, useBuyerMode } from '@/features/labBuying/buyerMode';
import { OrderCompletionActions } from '@/features/orders/completion/OrderCompletionActions';
import { Callout, Icon } from '@/components/design';
import { useContinueProject } from '@/features/doctor/orderCreate/useContinueProject';
import { CancelOrderAction } from '@/features/orders/cancel/CancelOrderAction';
import { OrderDetailView } from '@/features/orders/detail/OrderDetailView';
import { OrderReviewCard } from '@/features/reviews/OrderReviewCard';
import { useOrderContacts } from '@/features/orders/detail/useOrderContacts';
import {
  DOCTOR_DETAIL_ORDER_SELECT,
  isTerminal,
  type DetailOrder,
} from '@/features/orders/detail/types';
import { trashStateOf } from '@/features/orders/trash/trashApi';
import { MoveToTrashButton } from '@/features/orders/trash/MoveToTrashButton';
import { OrderGoneNotice, TrashedOrderBanner } from '@/features/orders/trash/TrashedOrderNotices';
import type { LabFormVersionRow, OrderAnswerRow } from '@/types/database';

/**
 * The doctor's order, or with `buyer` a lab's order to another lab (0048) at
 * `/lab/purchases/:orderId`: the same screen, read through the lab's buying
 * profile, linking only under `/lab/marketplace` and `/lab/purchases`.
 */
export function OrderDetailPage({ buyer: buyerProp = false }: { buyer?: boolean } = {}) {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { t: tl } = useTranslation('lab');
  const { user } = useAuth();
  const buyer = useBuyerMode(buyerProp);
  const continueProject = useContinueProject({ buyer });
  const qc = useQueryClient();
  // Whose order this must be. Explicit, never left to RLS: a lab owner can
  // read the orders it receives too, and an incoming order opened at a
  // purchase URL must read as not found (0048, B3). Decided by the route's
  // `buyer` prop, not by whether buyer mode resolved: a purchase route whose
  // session has no lab or no buying profile loads nothing, and never falls
  // back to reading the order unfiltered as a doctor would.
  const doctorId = buyerProp ? (buyer?.profileId ?? null) : (user?.doctor_profile?.id ?? null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    enabled: !!orderId && (!buyerProp || !!doctorId),
    queryFn: async () => {
      let q = supabase.from('orders').select(DOCTOR_DETAIL_ORDER_SELECT).eq('id', orderId!);
      if (doctorId) q = q.eq('doctor_id', doctorId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as DetailOrder | null;
    },
  });

  // A buying lab reads the rest only once the order has proved to be its own.
  const orderReady = !buyerProp || !!order;

  const { data: answers = [] } = useQuery({
    queryKey: ['order-answers', orderId],
    enabled: !!orderId && orderReady,
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
  const { staff, chatLink } = useOrderContacts(orderReady ? orderId : undefined);

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

  const ordersPath = buyer ? PURCHASE_PATHS.orders : '/doctor/orders';
  const ordersLabel = buyer ? tl('nav.purchases') : t('nav.orders');

  // Deleted from this side's list (0054, C3): gone is not shown at all; in
  // the trash the order is read-only under a banner with Restore.
  const trash = trashStateOf(order.order_trash);
  if (trash.kind === 'gone') return <OrderGoneNotice ordersPath={ordersPath} ordersLabel={ordersLabel} />;
  const inTrash = trash.kind === 'inTrash';

  const answersMap: Record<string, unknown> = {};
  for (const a of answers) answersMap[a.field_code] = a.answer_json;

  const editable = !isTerminal(order);

  return (
    <>
    {inTrash && <TrashedOrderBanner orderId={order.id} side="DOCTOR" purgeAfter={trash.purgeAfter} />}
    <OrderDetailView
      order={order}
      answers={answersMap}
      version={version}
      staff={staff}
      chatLink={chatLink}
      basePath="/doctor"
      ordersTo={buyer ? PURCHASE_PATHS.orders : undefined}
      labProfileTo={buyer ? PURCHASE_PATHS.lab(order.lab_id) : undefined}
      ordersLabel={ordersLabel}
      onInvoiceAcknowledged={() => qc.invalidateQueries({ queryKey: ['order', order.id] })}
      actions={
        inTrash ? undefined : (
        <>
          <OrderCompletionActions orderId={order.id} status={order.status} size="medium" />
          {/* A lab's purchase may have no patient (0048): nothing to continue. */}
          {order.status === 'COMPLETED' && order.patient_id && (
            <Button
              variant="contained"
              startIcon={<Icon name="add" size={16} />}
              onClick={() => continueProject.start(order.lab_id, order.patient_id!, order.id)}
            >
              {t('orders.continueProject')}
            </Button>
          )}
          {/* A finished order can leave this list (0054); the lab keeps it. */}
          <MoveToTrashButton
            orderId={order.id}
            status={order.status}
            side="DOCTOR"
            keeper="lab"
            listPath={ordersPath}
          />
        </>
        )
      }
      railFooter={
        inTrash ? undefined : (
        <Stack spacing={1.5}>
          {/* Rate the lab once the case is closed (0044). */}
          <OrderReviewCard order={order} />
          {/* Deliberately ungated by status, unlike "continue project" above:
              this is not the next phase of this case, it is a separate piece
              of work for the same patient, and the doctor has no reason to
              wait for this one to close before ordering it. `startForPatient`
              is the same launcher minus the lineage link, which is the only
              difference the two buttons have. */}
          {order.patient_id && (
            <Button
              variant="outlined"
              fullWidth
              startIcon={<Icon name="add" size={16} />}
              onClick={() => continueProject.startForPatient(order.lab_id, order.patient_id!)}
            >
              {t('orders.addAnotherService')}
            </Button>
          )}
          {editable && <Callout tone="brand">{t('orderDetail.editHint')}</Callout>}
          <CancelOrderAction orderId={order.id} status={order.status} orderKey={['order', order.id]} />
        </Stack>
        )
      }
    >
      {continueProject.modal}
    </OrderDetailView>
    </>
  );
}
