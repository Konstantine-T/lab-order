import { Alert, AlertTitle, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { OrderFilesField } from '@/features/orders/orderFiles/OrderFilesField';
import {
  Callout,
  DetailList,
  DetailRow,
  Icon,
  InitialsAvatar,
  PageHeader,
  ProgressSteps,
  SectionCard,
  SplitLayout,
} from '@/components/design';
import { OrderForm } from '@/features/orderForms/OrderForm';
import { OrderLineage } from '@/features/orders/OrderLineage';
import { ORDER_PIPELINE, PIPELINE_ICONS, pipelineIndex } from '@/features/orders/pipeline';
import { useContinueProject } from '@/features/doctor/orderCreate/useContinueProject';
import type {
  LabFormVersionRow,
  OrderAnswerRow,
  OrderChatPublicRow,
  OrderRow,
  OrderStaffPublicRow,
  OrderStatus,
} from '@/types/database';

type DetailRowType = OrderRow & {
  patients: { first_name: string; last_name: string; date_of_birth: string | null } | null;
};

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const continueProject = useContinueProject();

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
      return data as DetailRowType | null;
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

  // Staff the lab assigned to this order — names only, via the phone/email-safe
  // get_order_staff() RPC (doctors have no direct read on lab_staff).
  const { data: labTeam = [] } = useQuery({
    queryKey: ['order-staff-public', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_order_staff', {
        p_order_id: orderId!,
      });
      if (error) throw error;
      return (data ?? []) as OrderStaffPublicRow[];
    },
  });

  // The order's Telegram group invite link, if the lab created one. Doctors get
  // ONLY the link via get_order_chat() — never phones / unadded_members.
  const { data: orderChat } = useQuery({
    queryKey: ['order-chat-public', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_order_chat', {
        p_order_id: orderId!,
      });
      if (error) throw error;
      return ((data as OrderChatPublicRow[] | null) ?? [])[0] ?? null;
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

  const patientName = order.patients
    ? `${order.patients.first_name} ${order.patients.last_name}`
    : '—';
  const labName = labSnap?.public_name ?? '';
  const step = pipelineIndex(order.status as OrderStatus);
  const editable = order.status !== 'COMPLETED' && order.status !== 'CANCELLED';

  return (
    <>
      <PageHeader
        backTo="/doctor/orders"
        title={order.order_code}
        subtitle={[patientName, serviceSnap?.name].filter(Boolean).join(' · ')}
        chips={
          <>
            <OrderStatusChip status={order.status} />
            <PaymentStatusChip status={order.payment_status} />
          </>
        }
        actions={
          <>
            {editable && (
              <Button
                component={RouterLink}
                to={`/doctor/orders/${order.id}/edit`}
                variant="outlined"
                size="small"
                startIcon={<Icon name="edit" size={16} />}
              >
                {t('orders.editButton')}
              </Button>
            )}
            {order.status === 'COMPLETED' && (
              <Button
                variant="contained"
                size="small"
                startIcon={<Icon name="add" size={16} />}
                onClick={() => continueProject.start(order.lab_id, order.patient_id, order.id)}
              >
                {t('orders.continueProject')}
              </Button>
            )}
          </>
        }
      />

      {continueProject.modal}

      <SplitLayout
        rail={
          <>
            {/* Lab card */}
            <SectionCard>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <InitialsAvatar name={labName || '?'} size={38} variant="brand" />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.84375rem', fontWeight: 800 }} noWrap>
                    {labName || '—'}
                  </Typography>
                  {labTeam.length > 0 && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {labTeam.map((s) => `${s.first_name} ${s.last_name}`).join(', ')}
                    </Typography>
                  )}
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                {orderChat?.invite_link && (
                  <Button
                    href={orderChat.invite_link}
                    target="_blank"
                    rel="noopener"
                    size="small"
                    variant="contained"
                    fullWidth
                    startIcon={<Icon name="send" size={15} filled />}
                    sx={{ bgcolor: '#54A9EB', '&:hover': { bgcolor: '#3B93D8' } }}
                  >
                    {t('orderDetail.openChat')}
                  </Button>
                )}
                <Button
                  component={RouterLink}
                  to={`/doctor/labs/${order.lab_id}`}
                  size="small"
                  variant="outlined"
                  fullWidth
                >
                  {t('orderDetail.labProfileLink')}
                </Button>
              </Stack>
            </SectionCard>

            {/* Dates and destination */}
            <SectionCard>
              <DetailList>
                <DetailRow label={t('orderDetail.dueDate')} labelWidth={130}>
                  {order.requested_due_date ?? '—'}
                </DetailRow>
                <DetailRow label={t('orderDetail.confirmedDueDate')} labelWidth={130}>
                  {order.confirmed_due_date ? (
                    <Stack
                      direction="row"
                      spacing={0.625}
                      alignItems="center"
                      sx={{ color: 'success.main' }}
                    >
                      <Icon name="check_circle" size={15} filled />
                      {order.confirmed_due_date}
                    </Stack>
                  ) : (
                    '—'
                  )}
                </DetailRow>
                <DetailRow label={t('orderDetail.workLocation')} labelWidth={130}>
                  {[locSnap?.clinic_name, locSnap?.branch_name, locSnap?.city]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </DetailRow>
                <DetailRow label={t('orderDetail.createdAt')} labelWidth={130}>
                  {dayjs(order.created_at).format('YYYY-MM-DD HH:mm')}
                </DetailRow>
              </DetailList>
            </SectionCard>

            {/* Price */}
            {version && (
              <SectionCard title={tc('priceBreakdown.priceDetails')}>
                <PriceBreakdown
                  variant="plain"
                  pricing={version.pricing_configuration_json}
                  answers={answersMap}
                  rush={{ type: order.rush_type, value: order.rush_value ?? 0 }}
                  finalTotal={order.final_total}
                />
              </SectionCard>
            )}

            {/* View + download only; adding/removing lives on the edit page. */}
            <SectionCard icon="upload_file" title={tc('orderFiles.title')}>
              <OrderFilesField orderId={order.id} labId={order.lab_id} />
            </SectionCard>

            {editable && <Callout tone="brand">{t('orderDetail.editHint')}</Callout>}
          </>
        }
      >
        <OrderLineage
          orderId={order.id}
          basePath="/doctor/orders"
          label={t('orders.lineage.continuesFrom')}
        />

        {order.status === 'CANCELLED' && (
          <Alert severity="error">
            <AlertTitle>{t('orderDetail.cancellation.title')}</AlertTitle>
            {order.cancellation_reason || t('orderDetail.cancellation.noReason')}
          </Alert>
        )}

        {step != null && (
          <SectionCard icon="timeline" title={t('orderDetail.caseProgress')}>
            <ProgressSteps
              current={step}
              complete={order.status === 'COMPLETED'}
              steps={ORDER_PIPELINE.map((s) => ({
                key: s,
                label: tc(`orderStatus.${s}`),
                icon: PIPELINE_ICONS[s],
              }))}
            />
          </SectionCard>
        )}

        {version && (
          <SectionCard
            icon="assignment"
            title={t('orderDetail.answers')}
            meta={t('orderDetail.snapshot')}
          >
            <OrderForm
              configuration={version.configuration_json}
              pricing={version.pricing_configuration_json}
              values={answersMap}
              onChange={() => {}}
              readOnly
            />
          </SectionCard>
        )}
      </SplitLayout>
    </>
  );
}
