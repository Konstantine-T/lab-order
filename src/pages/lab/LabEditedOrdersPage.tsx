import { Box, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/design';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useParentOrderCodes } from '@/features/orders/useParentOrderCodes';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import { useInvoiceOrderIds } from '@/features/orders/orderFiles/useInvoiceOrderIds';
import { OrderCard } from '@/features/orders/list/OrderCard';
import { OrderCardGrid, OrderListTable } from '@/features/orders/list/view/OrderListTable';
import {
  labCustomerName,
  labListColumns,
  labListRow,
} from '@/features/orders/list/view/listRows';
import { LabRowBadges } from '@/features/orders/list/view/RowBadges';
import { OrdersViewToggle } from '@/features/orders/list/view/OrdersViewToggle';
import { useOrdersView } from '@/features/orders/list/view/useOrdersView';
import { isLabPurchase } from '@/features/lab/orders/labCustomer';
import {
  isAnswered,
  labCardRow,
  LAB_ORDER_LIST_SELECT,
  type LabListRow,
} from '@/features/lab/orders/labOrderList';
import { queueDates } from '@/features/lab/orders/orderPresets';

/**
 * Every order a doctor has edited, unconfirmed edits first. The queue's own
 * row or card (labOrderList), with its status read-only: the sheet is where
 * the lab reviews the edit and moves the order on.
 */
export function LabEditedOrdersPage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const navigate = useNavigate();
  const { view, setView, canSwitch } = useOrdersView('lab-edited');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['lab-edited-orders', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(LAB_ORDER_LIST_SELECT)
        // Not left to RLS: from 0048 the owner also reads its own purchases
        // from other labs, and edits it made to those are not this list's.
        .eq('lab_id', labId!)
        // Nor what this lab deleted (0054).
        .is('order_trash', null)
        .gt('edit_count', 0)
        // Unconfirmed edits float to the top, but every edited order stays in
        // the list permanently.
        .order('has_unreviewed_edits', { ascending: false })
        .order('last_edited_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LabListRow[];
    },
  });

  // Parent order codes for the continuation badges. Resolved from the rows
  // already loaded, with one batched query for any parent this page didn't
  // fetch — never a query per row.
  const parentCodes = useParentOrderCodes(orders);
  // The queue's invoice mark, from one query for the page. Fails soft.
  const invoicedIds = useInvoiceOrderIds({ labId, unacknowledgedOnly: false, enabled: !!labId });
  const rowDates = queueDates();

  return (
    <>
      <PageHeader
        title={t('editedOrders.title')}
        subtitle={t('editedOrders.subtitle')}
        actions={<OrdersViewToggle view={view} onChange={setView} canSwitch={canSwitch} />}
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : orders.length === 0 ? (
        <OrdersEmptyState icon="difference" title={t('editedOrders.empty')} />
      ) : view === 'list' ? (
        <OrderListTable
          columns={labListColumns({ t: tc })}
          rows={orders.map((row) =>
            labListRow(row, {
              dates: rowDates,
              invoiced: invoicedIds.has(row.id),
              onOpen: () => navigate(`/lab/orders/${row.id}`),
              lineage: { parentCode: parentCodes.get(row.continues_order_id ?? '') },
            }),
          )}
        />
      ) : (
        <OrderCardGrid>
          {orders.map((row) => (
            <OrderCard
              key={row.id}
              row={labCardRow(row)}
              perspective="lab"
              customer={{ name: labCustomerName(row), fromLab: isLabPurchase(row) }}
              highlight={row.has_unreviewed_edits || isAnswered(row)}
              extraBadges={<LabRowBadges row={row} invoiced={invoicedIds.has(row.id)} />}
              parentCode={parentCodes.get(row.continues_order_id ?? '')}
              href={`/lab/orders/${row.id}`}
            />
          ))}
        </OrderCardGrid>
      )}
    </>
  );
}
