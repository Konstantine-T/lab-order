import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Icon, PageHeader } from '@/components/design';
import { useParentOrderCodes } from '@/features/orders/useParentOrderCodes';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import { OrderCompletionActions } from '@/features/orders/completion/OrderCompletionActions';
import { canComplete } from '@/types/database';
import type { DoctorWorkLocationRow } from '@/types/database';
import {
  loadDraft,
  clearDraft,
  checkDraftBrokenness,
} from '@/features/doctor/orderCreate/draftStorage';
import { useContinueProject } from '@/features/doctor/orderCreate/useContinueProject';
import { useUnacknowledgedInvoices } from '@/features/orders/orderFiles/useUnacknowledgedInvoices';
import { OrderCard } from '@/features/orders/list/OrderCard';
import { DraftCard } from '@/features/orders/list/DraftCard';
import { GroupedOrderList, OrderListSkeleton } from '@/features/orders/list/GroupedOrderList';
import { OrdersFilterBar } from '@/features/orders/list/OrdersFilterBar';
import { useOrderListFilters } from '@/features/orders/list/useOrderListFilters';
import {
  activeCount,
  LIST_ORDER_SELECT,
  shortName,
  type ListOrderRow,
  type OrderGroupKey,
} from '@/features/orders/list/orderListModel';
import { PHONE_ADD_SX } from '@/features/orders/list/listStyles';
import { PURCHASE_PATHS, useBuyerMode } from '@/features/labBuying/buyerMode';

/** A purchase may name no patient (0048): its reference stands in for search. */
const purchaseSearchText = (row: ListOrderRow) => row.patient_reference ?? '';

/**
 * The doctor's orders, or with `buyer` a lab's orders to other labs (0048) at
 * `/lab/purchases`: the same list, filtered to the lab's buying profile and
 * linking only under `/lab/marketplace` and `/lab/purchases`.
 */
export function OrdersListPage({ buyer: buyerProp = false }: { buyer?: boolean } = {}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { t: tl } = useTranslation('lab');
  const { user } = useAuth();
  const buyer = useBuyerMode(buyerProp);
  // A buying lab's orders are its buying profile's. Every query below filters
  // on this id explicitly: the lab owner can also read the orders it receives
  // (the lab policy), and those must never show up here (0048, B3).
  const doctorId = buyer ? (buyer.profileId ?? undefined) : user?.doctor_profile?.id;
  // Drafts are keyed by (doctor, author) since 0023.
  const authorUserId = user?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const continueProject = useContinueProject({ buyer });
  const unseenInvoices = useUnacknowledgedInvoices({ doctorId, enabled: !!doctorId });
  const ordersPath = buyer ? PURCHASE_PATHS.orders : '/doctor/orders';
  const marketplacePath = buyer ? PURCHASE_PATHS.marketplace : '/doctor/marketplace';
  const orderNewPath = buyer ? PURCHASE_PATHS.orderNew : '/doctor/orders/new';

  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [draftSeen, setDraftSeen] = useState(false);

  const draftQuery = useQuery({
    queryKey: ['doctor-draft', doctorId, authorUserId],
    enabled: !!doctorId && !!authorUserId,
    queryFn: () => loadDraft(doctorId!, authorUserId!),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const draft = draftQuery.data ?? null;

  // Only open the modal once we know the DB actually has a draft — not from
  // a stale cache hit. refetchOnMount:'always' + staleTime:0 means isFetched
  // flips to true only after a fresh network round-trip on each mount, so a
  // draft that was deleted after submit will return null here.
  useEffect(() => {
    if (draftQuery.isFetched && draftQuery.data && !draftSeen) {
      setDraftModalOpen(true);
      setDraftSeen(true);
    }
  }, [draftQuery.isFetched, draftQuery.data, draftSeen]);

  const { data: draftBroken = null } = useQuery({
    queryKey: ['draft-broken-check', draft?.state.lab_id, draft?.state.lab_service_id],
    enabled: !!draft,
    queryFn: async () => {
      const [labRes, svcRes] = await Promise.all([
        supabase
          .from('labs')
          .select('is_active, approval_status')
          .eq('id', draft!.state.lab_id)
          .maybeSingle(),
        supabase
          .from('lab_services')
          .select('is_active, lab_forms!lab_services_linked_form_fk(status)')
          .eq('id', draft!.state.lab_service_id)
          .maybeSingle(),
      ]);
      const svc = svcRes.data as { is_active: boolean; lab_forms: { status: string } | null } | null;
      return checkDraftBrokenness(labRes.data, svc, svc?.lab_forms ?? null);
    },
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['doctor-orders', doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        // The reference only where it can exist: the doctor's list keeps the
        // select it had.
        .select(buyer ? `${LIST_ORDER_SELECT}, patient_reference` : LIST_ORDER_SELECT)
        .eq('doctor_id', doctorId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ListOrderRow[];
    },
  });

  // The subtitle's "clinic, branch" — the doctor's default work location. Same
  // key and query as the work-locations page, so the two share one cache entry
  // and an edit there refreshes the line here.
  const { data: locations = [] } = useQuery({
    queryKey: ['doctor-work-locations', doctorId],
    // A buying lab's one location is its own address; its subtitle names the lab.
    enabled: !!doctorId && !buyer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_work_locations')
        .select('*')
        .eq('doctor_id', doctorId!)
        .is('archived_at', null)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DoctorWorkLocationRow[];
    },
  });
  const location = locations[0];

  const filters = useOrderListFilters(orders, {
    sortArea: 'doctor',
    searchText: buyer ? purchaseSearchText : undefined,
  });

  // Parent order codes for the continuation badges. Resolved from the rows
  // already loaded, with one batched query for any parent this page didn't
  // fetch — never a query per row.
  const parentCodes = useParentOrderCodes(orders, doctorId);

  const handleDraftContinue = () => {
    if (!draft) return;
    setDraftModalOpen(false);
    navigate(`${orderNewPath}?lab=${draft.state.lab_id}&service=${draft.state.lab_service_id}`);
  };

  const handleDraftDiscard = async () => {
    if (doctorId && authorUserId) await clearDraft(doctorId, authorUserId);
    queryClient.setQueryData(['doctor-draft', doctorId, authorUserId], null);
    setDraftModalOpen(false);
  };

  // A buying lab's draft may have no patient: its reference stands in.
  const draftNoPatient = !!buyer && !!draft && !draft.state.with_patient;
  const draftReference = draft?.state.patient_reference?.trim() ?? '';
  const draftPatientName = draft
    ? draftNoPatient
      ? draftReference || t('labBuyer.patient.noPatient')
      : `${draft.state.patient.first_name} ${draft.state.patient.last_name}`.trim() || '—'
    : '';

  const subtitle = [
    buyer
      ? buyer.lab.public_name
      : user
        ? tc('orderList.doctorName', { name: `${user.first_name} ${user.last_name}` })
        : null,
    location
      ? [location.clinic_name, location.branch_name].filter(Boolean).join(', ')
      : null,
    isLoading ? null : tc('orderList.activeCount', { count: activeCount(orders) }),
  ]
    .filter(Boolean)
    .join(' · ');

  // A draft is not an order: it matches no status, lab or date, so any filter
  // hides it rather than pretending it passed.
  const drafts =
    draft && !filters.hasFilters
      ? [
          {
            key: 'draft',
            node: (
              <DraftCard
                serviceName={draft.serviceName}
                meta={[
                  draftNoPatient
                    ? draftReference
                    : shortName(draft.state.patient.first_name, draft.state.patient.last_name),
                  draft.labName,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                outdated={draftBroken?.broken}
                onContinue={handleDraftContinue}
                onDiscard={handleDraftDiscard}
              />
            ),
          },
        ]
      : [];

  /**
   * What can be done from the card itself — the old row footer's actions, plus
   * the redesign's reply button on a question. The detail screen still has
   * all of them.
   */
  const cardActions = (row: ListOrderRow, group: OrderGroupKey) => {
    if (row.status === 'CANCELLED') return undefined;
    if (row.status === 'COMPLETED') {
      // A lab's purchase may have no patient (0048): nothing to continue.
      const patientId = row.patient_id;
      if (!patientId) return undefined;
      return (
        <Button
          size="small"
          variant="outlined"
          startIcon={<Icon name="add" size={16} />}
          onClick={() => continueProject.start(row.lab_id, patientId, row.id)}
        >
          {t('orders.continueProject')}
        </Button>
      );
    }
    // The lab is blocked on a change: the change is the action.
    if (row.status === 'NEEDS_DOCTOR_INPUT') {
      return (
        <Button
          fullWidth
          variant="contained"
          size="small"
          startIcon={<Icon name="edit" size={16} />}
          onClick={() => navigate(`${ordersPath}/${row.id}/edit`)}
        >
          {t('orderDetail.clarification.editCta')}
        </Button>
      );
    }
    const edit = (
      <Button
        size="small"
        startIcon={<Icon name="edit" size={16} />}
        onClick={() => navigate(`${ordersPath}/${row.id}/edit`)}
      >
        {t('orders.editButton')}
      </Button>
    );
    if (row.status === 'NEEDS_CLARIFICATION' && group === 'needsYou') {
      return (
        <>
          <Button
            variant="contained"
            size="small"
            sx={{ flex: 1 }}
            startIcon={<Icon name="forum" size={16} />}
            // The answer box lives in the clarification panel on the order.
            onClick={() => navigate(`${ordersPath}/${row.id}`)}
          >
            {tc('orderList.reply')}
          </Button>
          {edit}
        </>
      );
    }
    if (canComplete(row.status)) {
      return (
        <>
          {edit}
          <OrderCompletionActions orderId={row.id} status={row.status} />
        </>
      );
    }
    return edit;
  };

  const newOrderButton = (
    <Button
      variant="contained"
      component={RouterLink}
      to={marketplacePath}
      startIcon={<Icon name="add" size={17} />}
    >
      {t('orders.newOrder')}
    </Button>
  );

  return (
    <>
      <PageHeader
        title={buyer ? tl('nav.purchases') : t('nav.orders')}
        subtitle={subtitle}
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
                the search beside it keeps room for its placeholder. The lab's
                sidebar has no such button, so a buying lab keeps it from `sm`
                up. */}
            <Button
              variant="contained"
              component={RouterLink}
              to={marketplacePath}
              aria-label={t('orders.newOrder')}
              sx={PHONE_ADD_SX}
            >
              <Icon name="add" size={20} />
            </Button>
            <Button
              variant="contained"
              component={RouterLink}
              to={marketplacePath}
              startIcon={<Icon name="add" size={17} />}
              sx={{ display: { xs: 'none', sm: 'inline-flex', md: buyer ? 'inline-flex' : 'none' } }}
            >
              {t('orders.newOrder')}
            </Button>
          </>
        }
      />

      {/* Draft resume modal */}
      <Dialog open={draftModalOpen} onClose={() => setDraftModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {draftBroken?.broken ? t('orders.draft.titleBroken') : t('orders.draft.title')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            <Stack spacing={0.5}>
              <Typography variant="subtitle1">{draftPatientName}</Typography>
              {draft && (
                <Typography variant="body1" color="text.secondary">
                  {[draft.labName, draft.serviceName].filter(Boolean).join(' · ')}
                </Typography>
              )}
            </Stack>
            {draftBroken?.broken && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {t('orders.draft.brokenAlert')}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDraftDiscard} color="inherit">{t('orders.draft.discard')}</Button>
          {draftBroken?.broken ? (
            <Button variant="outlined" onClick={handleDraftContinue}>
              {t('orders.draft.viewBroken')}
            </Button>
          ) : (
            <Button variant="contained" onClick={handleDraftContinue}>
              {t('orders.draft.continue')}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Stack spacing={2.5}>
        {!isLoading && orders.length > 0 && <OrdersFilterBar filters={filters} />}

        {isLoading ? (
          <OrderListSkeleton />
        ) : orders.length === 0 && drafts.length === 0 ? (
          <OrdersEmptyState title={t('orders.empty')} action={newOrderButton} />
        ) : filters.filtered.length === 0 && filters.hasFilters ? (
          <OrdersEmptyState
            icon="filter_alt_off"
            title={t('orders.filters.noResults')}
            action={
              <Button size="small" onClick={filters.clear}>
                {t('orders.filters.clear')}
              </Button>
            }
          />
        ) : (
          <GroupedOrderList
            rows={filters.filtered}
            drafts={drafts}
            resetKey={filters.resetKey}
            sort={filters.sort}
            renderCard={(row, group) => (
              <OrderCard
                row={row}
                group={group}
                href={`${ordersPath}/${row.id}`}
                invoiceUnseen={unseenInvoices.has(row.id)}
                parentCode={parentCodes.get(row.continues_order_id ?? '')}
                actions={cardActions(row, group)}
              />
            )}
          />
        )}
      </Stack>
      {continueProject.modal}
    </>
  );
}
