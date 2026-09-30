import { useMemo, type ReactNode } from 'react';
import { Alert, AlertTitle, Box, Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, SectionCard } from '@/components/design';
import { OrderLineage } from '@/features/orders/OrderLineage';
import { ClarificationPanel } from '@/features/orders/clarifications/ClarificationPanel';
import { OrderFilesField, orderFilesKey } from '@/features/orders/orderFiles/OrderFilesField';
import { LabContactLine } from '@/features/orders/orderFiles/LabContactLine';
import { listOrderFiles } from '@/features/orders/orderFiles/orderFilesApi';
import { layout } from '@/theme/tokens';
import type { LabFormVersionRow, OrderStaffPublicRow } from '@/types/database';
import { OrderDetailHeader } from './OrderDetailHeader';
import { OrderStepperCard } from './OrderStepperCard';
import { OrderAnswersCard, OrderSummaryCard } from './OrderSummaryCard';
import { LabCard, PriceDueCard } from './OrderRailCards';
import { orderFacts } from './orderFacts';
import { telHref } from './format';
import { isTerminal, type DetailOrder } from './types';

/**
 * One card in the page's reading order.
 *
 * From `lg` up the page is two columns and each keeps its own DOM order. Below
 * that both column wrappers turn `display: contents`, every card becomes a
 * sibling in one column, and `order` interleaves them the way the phone mockup
 * reads — progress, then price and lab, then the chart. One tree for every
 * width, so nothing stateful (a half-typed clarification answer, say) is ever
 * rendered twice.
 *
 * `:empty` hides the wrapper of a block that rendered nothing — the lineage
 * trail, the clarification panel — so it cannot leave a double gap behind.
 */
function Slot({ order, children }: { order: number; children: ReactNode }) {
  return (
    <Box sx={{ order: { xs: order, lg: 0 }, minWidth: 0, '&:empty': { display: 'none' } }}>
      {children}
    </Box>
  );
}

/** Attachments, with the lab's email line for the file that will not upload. */
function FilesCard({ order }: { order: DetailOrder }) {
  const { t: tc } = useTranslation('common');
  // The same key and fetcher as the list inside, so this is the list's own
  // cached result, not a second request.
  const { data: files } = useQuery({
    queryKey: orderFilesKey(order.id),
    queryFn: () => listOrderFiles(order.id),
  });
  const title = files?.length ? `${tc('orderFiles.title')} · ${files.length}` : tc('orderFiles.title');

  return (
    // View + download only; adding/removing lives on the edit page.
    <SectionCard icon="upload_file" title={title}>
      <OrderFilesField orderId={order.id} labId={order.lab_id} />
      <LabContactLine email={order.labs?.contact_email} orderCode={order.order_code} />
    </SectionCard>
  );
}

/** Height the phone action bar takes, reserved at the foot of the page. */
const BAR_HEIGHT = 70;

/**
 * The phone mockup's bottom bar: call the lab, or open the order's chat. Each
 * half appears only when it exists — the lab's live phone number, the
 * Telegram group the lab created — and with neither there is no bar at all.
 */
function PhoneActionBar({ phone, chatLink }: { phone?: string | null; chatLink: string | null }) {
  const { t } = useTranslation('doctor');
  const tel = telHref(phone);
  if (!tel && !chatLink) return null;

  return (
    <>
      <Box sx={{ display: { xs: 'block', sm: 'none' }, height: BAR_HEIGHT }} />
      <Box
        sx={{
          display: { xs: 'flex', sm: 'none' },
          position: 'fixed',
          left: 0,
          right: 0,
          // On top of the doctor/clinic tab bar.
          bottom: 'var(--bottom-nav-height, 0px)',
          gap: 1,
          px: 2,
          py: 1.25,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          // Below MUI's modal layer, so dialogs still cover it.
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        {tel &&
          (chatLink ? (
            <Button
              href={tel}
              variant="outlined"
              aria-label={t('orderDetail.phoneBar.call')}
              sx={{ minWidth: 48, width: 48, height: 48, p: 0, flexShrink: 0 }}
            >
              <Icon name="call" size={20} />
            </Button>
          ) : (
            <Button href={tel} variant="outlined" fullWidth startIcon={<Icon name="call" size={18} />} sx={{ height: 48 }}>
              {t('orderDetail.phoneBar.call')}
            </Button>
          ))}
        {chatLink && (
          <Button
            href={chatLink}
            target="_blank"
            rel="noopener noreferrer"
            variant="contained"
            fullWidth
            startIcon={<Icon name="send" size={18} />}
            sx={{ height: 48 }}
          >
            {t('orderDetail.phoneBar.chat')}
          </Button>
        )}
      </Box>
    </>
  );
}

export type OrderDetailViewProps = {
  order: DetailOrder;
  /** `order_answers` folded into one map, field_code → answer_json. */
  answers: Record<string, unknown>;
  /** The form version the order was submitted on; undefined while loading. */
  version: LabFormVersionRow | null | undefined;
  staff: OrderStaffPublicRow[];
  chatLink: string | null;
  /** The role's route subtree: '/doctor' or '/clinic'. */
  basePath: string;
  /** The role's own "Orders" nav label, for the breadcrumb. */
  ordersLabel: string;
  /** Role-specific header buttons, placed between "edit" and "open chat". */
  actions?: ReactNode;
  /** Role-specific block at the foot of the rail. */
  railFooter?: ReactNode;
  /** Refresh the order row the invoice acknowledgement just changed. */
  onInvoiceAcknowledged: () => void;
  /** Clinic: name the doctor in the phone header as well. */
  doctorOnPhone?: boolean;
  /** Dialogs and other overlays the page owns. */
  children?: ReactNode;
};

/**
 * The order screen shared by the doctor and the clinic admin acting for them.
 *
 * The pages own their data (and so their query keys, which other screens
 * invalidate) and the one or two actions only their role has; everything else
 * — what an order looks like, and every block a doctor-side user acts on — is
 * here, so the two screens cannot drift apart.
 */
export function OrderDetailView({
  order,
  answers,
  version,
  staff,
  chatLink,
  basePath,
  ordersLabel,
  actions,
  railFooter,
  onInvoiceAcknowledged,
  doctorOnPhone,
  children,
}: OrderDetailViewProps) {
  const { t } = useTranslation('doctor');

  const ordersTo = `${basePath}/orders`;
  const editTo = `${ordersTo}/${order.id}/edit`;
  const editable = !isTerminal(order);

  const facts = useMemo(
    () =>
      version
        ? orderFacts(version.configuration_json, version.pricing_configuration_json, answers)
        : null,
    [version, answers],
  );

  return (
    <>
      <OrderDetailHeader
        order={order}
        ordersTo={ordersTo}
        ordersLabel={ordersLabel}
        doctorOnPhone={doctorOnPhone}
        actions={
          <>
            {editable && (
              <Button
                component={RouterLink}
                to={editTo}
                variant="outlined"
                startIcon={<Icon name="edit" size={16} />}
              >
                {t('orderDetail.header.editWithReason')}
              </Button>
            )}
            {actions}
            {/* The phone has this in its bottom bar instead. */}
            {chatLink && (
              <Button
                href={chatLink}
                target="_blank"
                rel="noopener noreferrer"
                variant="contained"
                startIcon={<Icon name="send" size={16} />}
                sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
              >
                {t('orderDetail.openChat')}
              </Button>
            )}
          </>
        }
      />

      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          alignItems: { lg: 'flex-start' },
          gap: { xs: 2, lg: 2.5 },
        }}
      >
        <Box
          sx={{
            display: { xs: 'contents', lg: 'flex' },
            flexDirection: 'column',
            gap: 2,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Slot order={1}>
            <OrderLineage orderId={order.id} basePath={ordersTo} label={t('orders.lineage.continuesFrom')} />
          </Slot>

          {order.status === 'CANCELLED' && (
            <Slot order={2}>
              <Alert severity="error">
                <AlertTitle>{t('orderDetail.cancellation.title')}</AlertTitle>
                {order.cancellation_reason || t('orderDetail.cancellation.noReason')}
              </Alert>
            </Slot>
          )}

          {/* Above the case progress: if the lab is waiting on an answer — or
              on an edit — that is the first thing to see on this page. */}
          <Slot order={3}>
            <ClarificationPanel orderId={order.id} canAnswer={editable} editTo={editTo} />
          </Slot>

          <Slot order={4}>
            <OrderStepperCard order={order} staff={staff} />
          </Slot>

          {version && facts && (
            <>
              <Slot order={8}>
                <OrderSummaryCard order={order} facts={facts} />
              </Slot>
              <Slot order={9}>
                <OrderAnswersCard
                  version={version}
                  answers={answers}
                  defaultOpen={facts.teeth.length === 0}
                />
              </Slot>
            </>
          )}

          {/* Not gated on `version` — attachments exist whether or not the
              form version loaded. */}
          <Slot order={10}>
            <FilesCard order={order} />
          </Slot>
        </Box>

        <Box
          sx={{
            display: { xs: 'contents', lg: 'flex' },
            flexDirection: 'column',
            gap: 2,
            width: { lg: layout.railWidth },
            flexShrink: 0,
          }}
        >
          <Slot order={5}>
            <PriceDueCard
              order={order}
              answers={answers}
              version={version}
              onInvoiceAcknowledged={onInvoiceAcknowledged}
            />
          </Slot>
          <Slot order={6}>
            <LabCard order={order} staff={staff} profileTo={`${basePath}/labs/${order.lab_id}`} />
          </Slot>
          {railFooter && <Slot order={11}>{railFooter}</Slot>}
        </Box>
      </Box>

      <PhoneActionBar phone={order.labs?.contact_phone} chatLink={chatLink} />
      {children}
    </>
  );
}
