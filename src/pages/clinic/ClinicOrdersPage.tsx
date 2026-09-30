import { useCallback, useMemo } from 'react';
import { Button, InputAdornment, Stack, TextField } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Icon, PageHeader } from '@/components/design';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useUnacknowledgedInvoices } from '@/features/orders/orderFiles/useUnacknowledgedInvoices';
import { useParentOrderCodes } from '@/features/orders/useParentOrderCodes';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import { clearDraft, loadDraftsByAuthor } from '@/features/doctor/orderCreate/draftStorage';
import { OrderCard } from '@/features/orders/list/OrderCard';
import { DraftCard } from '@/features/orders/list/DraftCard';
import { GroupedOrderList, OrderListSkeleton } from '@/features/orders/list/GroupedOrderList';
import { OrdersFilterBar } from '@/features/orders/list/OrdersFilterBar';
import { PHONE_ADD_SX } from '@/features/orders/list/listStyles';
import { useOrderListFilters } from '@/features/orders/list/useOrderListFilters';
import { relativeAge } from '@/features/orders/list/listFormat';
import {
  activeCount,
  LIST_ORDER_SELECT,
  shortName,
  type ListOrderRow,
  type OrderGroupKey,
} from '@/features/orders/list/orderListModel';
import type { ClinicDoctorRow } from '@/types/database';

export function ClinicOrdersPage() {
  const { t } = useTranslation('clinic');
  const { t: tc } = useTranslation('common');
  const { t: td } = useTranslation('doctor');
  const { user } = useAuth();
  const clinicId = user?.clinic?.id;
  const authorUserId = user?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: doctors = [] } = useQuery({
    queryKey: ['clinic-doctors', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('clinic_doctors');
      if (error) throw error;
      return (data ?? []) as ClinicDoctorRow[];
    },
  });

  // RLS returns only orders whose doctor is under this clinic — no client filter needed.
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['clinic-orders', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(LIST_ORDER_SELECT)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ListOrderRow[];
    },
  });

  // Unfinished orders. The admin autosaves a draft per doctor they order for,
  // and without this the only way back into one is to retrace the same lab and
  // service by hand — the doctor's own orders list has surfaced theirs since
  // drafts existed.
  const { data: drafts = [] } = useQuery({
    queryKey: ['clinic-drafts', authorUserId],
    enabled: !!authorUserId,
    queryFn: () => loadDraftsByAuthor(authorUserId!),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const discardDraft = async (doctorId: string) => {
    if (!authorUserId) return;
    await clearDraft(doctorId, authorUserId);
    await queryClient.invalidateQueries({ queryKey: ['clinic-drafts', authorUserId] });
  };

  const doctorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of doctors) m.set(d.doctor_id, `${d.first_name} ${d.last_name}`);
    return m;
  }, [doctors]);

  // The clinic's current roster first; the order's own snapshot for a doctor
  // the roster no longer lists.
  const doctorOf = useCallback(
    (row: ListOrderRow) =>
      doctorName.get(row.doctor_id) ??
      [row.doctor_snapshot?.first_name, row.doctor_snapshot?.last_name]
        .filter(Boolean)
        .join(' '),
    [doctorName],
  );

  const filters = useOrderListFilters(orders, { sortArea: 'clinic', searchText: doctorOf });
  const doctorOptions = useMemo(
    () =>
      doctors
        .map((d) => ({ value: d.doctor_id, label: `${d.first_name} ${d.last_name}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [doctors],
  );

  // Parent order codes for the continuation badges. Resolved from the rows
  // already loaded, with one batched query for any parent this page didn't
  // fetch — never a query per row.
  const parentCodes = useParentOrderCodes(orders);
  // No doctor filter: RLS already scopes the clinic to its own doctors.
  const unseenInvoices = useUnacknowledgedInvoices();

  const subtitle = [
    user?.clinic?.public_name,
    isLoading ? null : tc('orderList.activeCount', { count: activeCount(orders) }),
  ]
    .filter(Boolean)
    .join(' · ');

  // A draft is not an order: it has no status, lab or due date to match, so
  // those filters hide it. The doctor filter is the exception — a draft is for
  // one doctor.
  const draftItems = drafts
    .filter((d) => !filters.hasOrderFilters && (!filters.doctorId || d.doctorId === filters.doctorId))
    .map((d) => ({
      key: d.doctorId,
      node: (
        <DraftCard
          serviceName={d.serviceName}
          meta={[shortName(d.state.patient.first_name, d.state.patient.last_name), d.labName]
            .filter(Boolean)
            .join(' · ')}
          doctorName={doctorName.get(d.doctorId)}
          savedAgo={relativeAge(d.updatedAt, tc)}
          onContinue={() =>
            navigate(
              `/clinic/orders/new?doctor=${d.doctorId}&lab=${d.state.lab_id}&service=${d.state.lab_service_id}`,
            )
          }
          onDiscard={() => discardDraft(d.doctorId)}
        />
      ),
    }));

  /** The two asks that name what to do next get their button on the card; the
   *  rest is on the order, as it always was for the clinic. */
  const cardActions = (row: ListOrderRow, group: OrderGroupKey) => {
    if (row.status === 'NEEDS_DOCTOR_INPUT') {
      return (
        <Button
          fullWidth
          variant="contained"
          size="small"
          startIcon={<Icon name="edit" size={16} />}
          onClick={() => navigate(`/clinic/orders/${row.id}/edit`)}
        >
          {td('orderDetail.clarification.editCta')}
        </Button>
      );
    }
    if (row.status === 'NEEDS_CLARIFICATION' && group === 'needsYou') {
      return (
        <Button
          fullWidth
          variant="contained"
          size="small"
          startIcon={<Icon name="forum" size={16} />}
          onClick={() => navigate(`/clinic/orders/${row.id}`)}
        >
          {tc('orderList.reply')}
        </Button>
      );
    }
    return undefined;
  };

  return (
    <>
      <PageHeader
        title={t('orders.title')}
        subtitle={subtitle || t('orders.subtitle')}
        actions={
          <>
            <TextField
              placeholder={tc('orderList.searchPlaceholder')}
              value={filters.search}
              onChange={(e) => filters.setSearch(e.target.value)}
              size="small"
              sx={{ width: { sm: 260 } }}
              inputProps={{ 'aria-label': tc('orderList.searchPlaceholder') }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Icon name="search" size={18} sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />
            {/* The top bar carries "New order" from `md` up; below it the bar
                has none, so the page keeps its own — a square on a phone, so
                the search beside it keeps room for its placeholder. */}
            <Button
              variant="contained"
              aria-label={t('orders.newOrder')}
              onClick={() => navigate('/clinic/orders/new')}
              sx={PHONE_ADD_SX}
            >
              <Icon name="add" size={20} />
            </Button>
            <Button
              variant="contained"
              startIcon={<Icon name="add" size={17} />}
              onClick={() => navigate('/clinic/orders/new')}
              sx={{ flexShrink: 0, display: { xs: 'none', sm: 'inline-flex', md: 'none' } }}
            >
              {t('orders.newOrder')}
            </Button>
          </>
        }
      />

      <Stack spacing={2.5}>
        {!isLoading && orders.length > 0 && (
          <OrdersFilterBar filters={filters} doctorOptions={doctorOptions} />
        )}

        {isLoading ? (
          <OrderListSkeleton />
        ) : orders.length === 0 && draftItems.length === 0 ? (
          <OrdersEmptyState title={t('orders.empty')} />
        ) : filters.filtered.length === 0 && filters.hasFilters && draftItems.length === 0 ? (
          <OrdersEmptyState
            icon="filter_alt_off"
            title={td('orders.filters.noResults')}
            action={
              <Button size="small" onClick={filters.clear}>
                {td('orders.filters.clear')}
              </Button>
            }
          />
        ) : (
          <GroupedOrderList
            rows={filters.filtered}
            drafts={draftItems}
            resetKey={filters.resetKey}
            sort={filters.sort}
            renderCard={(row, group) => (
              <OrderCard
                row={row}
                group={group}
                href={`/clinic/orders/${row.id}`}
                doctorName={doctorOf(row) || undefined}
                invoiceUnseen={unseenInvoices.has(row.id)}
                parentCode={parentCodes.get(row.continues_order_id ?? '')}
                actions={cardActions(row, group)}
              />
            )}
          />
        )}
      </Stack>
    </>
  );
}
