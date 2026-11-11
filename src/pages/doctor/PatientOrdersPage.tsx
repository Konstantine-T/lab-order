import { Box, Button, CircularProgress } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon, PageHeader } from '@/components/design';
import { useQuery } from '@tanstack/react-query';
import { useContinueProject } from '@/features/doctor/orderCreate/useContinueProject';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { OrderCard } from '@/features/orders/list/OrderCard';
import { LIST_ORDER_SELECT, type ListOrderRow } from '@/features/orders/list/orderListModel';
import { OrderCardGrid, OrderListTable } from '@/features/orders/list/view/OrderListTable';
import { orderListColumns, orderListRow } from '@/features/orders/list/view/listRows';
import { OrdersViewToggle } from '@/features/orders/list/view/OrdersViewToggle';
import { useOrdersView } from '@/features/orders/list/view/useOrdersView';
import { queueDates } from '@/features/lab/orders/orderPresets';
import { useParentOrderCodes } from '@/features/orders/useParentOrderCodes';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import { ORDER_TRASH_EMBED } from '@/features/orders/trash/trashFilter';
import type { PatientRow } from '@/types/database';

export function PatientOrdersPage() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const doctorId = user?.doctor_profile?.id;
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const continueProject = useContinueProject();

  const { data: patient } = useQuery({
    queryKey: ['doctor-patient', patientId],
    enabled: !!patientId && !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('id, first_name, last_name')
        .eq('id', patientId!)
        .eq('doctor_id', doctorId!)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<PatientRow, 'id' | 'first_name' | 'last_name'> | null;
    },
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['doctor-patient-orders', patientId],
    enabled: !!patientId && !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        // The orders list's own row, so the list and the cards read one shape.
        .select(`${LIST_ORDER_SELECT}, ${ORDER_TRASH_EMBED}`)
        .eq('doctor_id', doctorId!)
        .eq('patient_id', patientId!)
        // Not what the doctor deleted (0054).
        .is('order_trash', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ListOrderRow[];
    },
  });

  const patientName = patient
    ? `${patient.first_name} ${patient.last_name}`
    : '…';

  // Which lab a patient-level new order goes to: the one they most recently
  // ordered from (the query is created_at desc). With no orders there's no lab
  // to infer, so the button hides and the first order goes via the marketplace.
  const latestLabId = orders[0]?.lab_id;

  // Parent order codes for the continuation badges. Resolved from the rows
  // already loaded, with one batched query for any parent this page didn't
  // fetch — never a query per row.
  const parentCodes = useParentOrderCodes(orders);

  // List or cards, per person (the list by default here).
  const { view, setView, canSwitch } = useOrdersView('doctor-patient');
  const rowDates = queueDates();

  /** The old row footer's buttons, for the card and the list alike. */
  const actionsOf = (row: ListOrderRow) =>
    row.status === 'CANCELLED' ? undefined : (
      <>
        {row.status !== 'COMPLETED' && (
          <Button
            size="small"
            startIcon={<Icon name="edit" size={16} />}
            onClick={() => navigate(`/doctor/orders/${row.id}/edit`)}
          >
            {t('orders.editButton')}
          </Button>
        )}
        {patientId && (
          <Button
            size="small"
            startIcon={<Icon name="add" size={16} />}
            onClick={() => continueProject.startForPatient(row.lab_id, patientId)}
          >
            {t('orders.addAnotherService')}
          </Button>
        )}
        {row.status === 'COMPLETED' && patientId && (
          <Button
            size="small"
            variant="contained"
            startIcon={<Icon name="add" size={16} />}
            onClick={() => continueProject.start(row.lab_id, patientId, row.id)}
          >
            {t('orders.continueProject')}
          </Button>
        )}
      </>
    );

  return (
    <>
      <PageHeader
        backTo="/doctor/patients"
        title={patientName}
        subtitle={t('patientOrders.title')}
        actions={
          <>
            <OrdersViewToggle view={view} onChange={setView} canSwitch={canSwitch} />
            {latestLabId && patientId && (
              <Button
                variant="contained"
                startIcon={<Icon name="add" size={18} />}
                onClick={() => continueProject.startForPatient(latestLabId, patientId)}
              >
                {t('orders.addNewOrder')}
              </Button>
            )}
          </>
        }
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : orders.length === 0 ? (
        <OrdersEmptyState title={t('patientOrders.empty')} />
      ) : view === 'list' ? (
        <OrderListTable
          columns={orderListColumns('doctor', { t: tc })}
          rows={orders.map((row) =>
            orderListRow(row, {
              perspective: 'doctor',
              dates: rowDates,
              onOpen: () => navigate(`/doctor/orders/${row.id}`),
              parentCode: parentCodes.get(row.continues_order_id ?? ''),
              actions: actionsOf(row),
            }),
          )}
        />
      ) : (
        <OrderCardGrid>
          {orders.map((row) => (
            <OrderCard
              key={row.id}
              row={row}
              href={`/doctor/orders/${row.id}`}
              parentCode={parentCodes.get(row.continues_order_id ?? '')}
              actions={actionsOf(row)}
            />
          ))}
        </OrderCardGrid>
      )}
      {continueProject.modal}
    </>
  );
}
