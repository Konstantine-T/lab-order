import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Link,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { formatGEL } from '@/utils/pricing';
import { PaymentStatusChip } from '@/components/OrderStatusChip';
import {
  type Column,
  DataRow,
  DataTable,
  PageHeader,
  SectionCard,
  StatCard,
  StatGrid,
  Icon,
  StatusPill,
} from '@/components/design';
import { OrdersPaginator } from '@/features/orders/OrdersPaginator';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import {
  AmountCell,
  CustomerCell,
  DueCell,
  OrderCodeCell,
  OrderStatusCell,
  PatientCell,
  TextCell,
} from '@/features/orders/table/OrderRowCells';
import { queueDates } from '@/features/lab/orders/orderPresets';
import { FinanceOrderCard } from '@/features/finances/FinanceOrderCard';
import {
  selectedPaymentSquare,
  SQUARE_PAYMENT_STATUSES,
  squareTotals,
  type PaymentSquare,
} from '@/features/finances/paymentSquares';
import { RecordPaymentDialog } from '@/features/lab/finances/RecordPaymentDialog';
import { useFinanceLock } from '@/features/lab/finances/financeLockContext';
import { FinanceFilterBar } from '@/features/lab/finances/FinanceFilterBar';
import {
  CUSTOMER_TYPE_LABEL,
  defaultReceivableFilters,
  fetchReceivablesByCustomer,
  fetchReceivablesList,
  hiddenReceivableFilterCount,
  type ReceivableFilters,
  type ReceivableSort,
} from '@/features/lab/finances/financeApi';
import type { LabReceivableOrder, PaymentStatus } from '@/types/database';

const PAYMENT_STATUSES: readonly PaymentStatus[] = ['UNPAID', 'PARTIALLY_PAID', 'PAID'];

const CUSTOMER_COLUMNS: Column[] = [
  { key: 'customer', width: 'minmax(0, 2fr)' },
  { key: 'orders', width: '80px', align: 'right' },
  { key: 'billed', width: '110px', align: 'right' },
  { key: 'paid', width: '110px', align: 'right' },
  { key: 'outstanding', width: '120px', align: 'right' },
];

/**
 * The orders queue's row (code, patient, customer, service, due, status), then
 * the money: billed, paid, and outstanding with the payment and overdue pills
 * under it, and the record-payment button. Sized to fit the content column at
 * 1440px without scrolling sideways: the pills share the outstanding column
 * and the button is an icon.
 */
const ORDER_COLUMNS: Column[] = [
  { key: 'order', width: '84px' },
  { key: 'patient', width: 'minmax(0, 1.1fr)' },
  { key: 'customer', width: 'minmax(0, 1fr)' },
  { key: 'service', width: 'minmax(0, 1fr)' },
  { key: 'due', width: '120px' },
  // The status pill, with the completed date under it.
  { key: 'orderStatus', width: 'minmax(116px, auto)' },
  { key: 'billed', width: '84px', align: 'right' },
  { key: 'paid', width: '84px', align: 'right' },
  // "ნაწილობრივ გადახდილი" is a 176px pill; `auto` gives it the room only
  // when a row actually carries that status.
  { key: 'outstanding', width: 'minmax(108px, auto)', align: 'right' },
  { key: 'record', width: '36px', align: 'right' },
];

/** Money overdue: past its confirmed date with something still owed. */
function isOverdue(o: LabReceivableOrder): boolean {
  return (
    !!o.confirmed_due_date &&
    dayjs(o.confirmed_due_date).isBefore(dayjs(), 'day') &&
    Number(o.outstanding) > 0
  );
}

export function LabFinancesPage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const qc = useQueryClient();
  const { lock } = useFinanceLock();

  const [filters, setFilters] = useState<ReceivableFilters>(defaultReceivableFilters);
  const [sort, setSort] = useState<ReceivableSort>('created_desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [payingOrder, setPayingOrder] = useState<LabReceivableOrder | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const customersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPage(1);
  }, [filters, sort, pageSize]);

  // The lab dashboard's "unpaid" square hands over payment statuses in router
  // state. This page mounts only behind the passcode (FinanceLockGate), so a
  // lab that had to type it first still lands on the filtered list. Applied
  // from clean filters, then cleared, so a refresh or Back does not re-apply
  // it over filters changed since. A preset that sets anything behind "More
  // filters" opens the panel, so what was applied is in view.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const raw = (location.state as { paymentStatuses?: unknown } | null)?.paymentStatuses;
    if (!Array.isArray(raw)) return;
    const statuses = PAYMENT_STATUSES.filter((s) => raw.includes(s));
    if (statuses.length > 0) {
      const next = { ...defaultReceivableFilters, statuses };
      setFilters(next);
      if (hiddenReceivableFilterCount(next) > 0) setMoreOpen(true);
    }
    navigate(location.pathname, { replace: true, state: null });
    // Only a new navigation should apply it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const byCustomer = useQuery({
    queryKey: ['lab-receivables-by-customer', labId, filters],
    enabled: !!labId,
    queryFn: () => fetchReceivablesByCustomer(labId!, filters),
  });

  // The squares: every filter but the payment status (J2), so a square's
  // number does not move when clicking it sets that filter. Same key prefix
  // as the rollup, so the live refresh and refetchAll cover it, and with no
  // payment status selected it is the same request.
  const squareFilters = useMemo(() => ({ ...filters, statuses: [] }), [filters]);
  const squaresQuery = useQuery({
    queryKey: ['lab-receivables-by-customer', labId, squareFilters],
    enabled: !!labId,
    queryFn: () => fetchReceivablesByCustomer(labId!, squareFilters),
  });

  const list = useQuery({
    queryKey: ['lab-receivables-list', labId, filters, sort, page, pageSize],
    enabled: !!labId,
    queryFn: () => fetchReceivablesList(labId!, filters, sort, page, pageSize),
  });

  const totals = useMemo(() => squareTotals(byCustomer.data ?? []), [byCustomer.data]);
  const squares = useMemo(() => squareTotals(squaresQuery.data ?? []), [squaresQuery.data]);
  const selectedSquare = selectedPaymentSquare(filters.statuses);

  const hasFilters =
    filters.search.trim() !== '' ||
    filters.recipientType !== null ||
    filters.customerId !== null ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.overdueOnly ||
    filters.minAmount !== null ||
    filters.maxAmount !== null ||
    filters.statuses.length > 0 ||
    filters.orderStatuses.length > 0;

  const totalCount = list.data?.[0]?.total_count ? Number(list.data[0].total_count) : 0;
  const selectedCustomer =
    filters.customerId != null
      ? (byCustomer.data ?? []).find((c) => c.customer_id === filters.customerId)
      : undefined;

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ['lab-receivables-by-customer'] });
    qc.invalidateQueries({ queryKey: ['lab-receivables-list'] });
    qc.invalidateQueries({ queryKey: ['lab-orders'] });
  };

  const pickSquare = (square: PaymentSquare) =>
    setFilters({ ...filters, statuses: [...SQUARE_PAYMENT_STATUSES[square]] });
  const showLabel = (label: string, value: string) => tc('statCard.show', { label, value });

  const loading = byCustomer.isLoading || list.isLoading;

  // The "Customers" square scrolls to the by-customer table once the filter it
  // set has loaded: until then the table may be a spinner.
  const [scrollToCustomers, setScrollToCustomers] = useState(false);
  useEffect(() => {
    if (!scrollToCustomers || loading) return;
    customersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollToCustomers(false);
  }, [scrollToCustomers, loading]);

  const rowDates = queueDates();
  const moneyLabels = {
    billed: t('finances.table.billed'),
    paid: t('finances.table.paid'),
    outstanding: t('finances.table.outstanding'),
    overdue: t('finances.table.overdue'),
  };

  const recordButton = (o: LabReceivableOrder) => (
    // Its own target: neither the click nor Enter on it opens the order.
    <Box
      sx={{ textAlign: 'right' }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Tooltip title={t('finances.table.record')}>
        <IconButton
          size="small"
          color="primary"
          aria-label={`${t('finances.table.record')}: ${o.order_code}`}
          onClick={() => setPayingOrder(o)}
        >
          <Icon name="payments" size={18} />
        </IconButton>
      </Tooltip>
    </Box>
  );

  // Under the customer: the doctor, when the invoice goes to someone else
  // (a clinic) and the doctor is not already the name above.
  const doctorDetail = (o: LabReceivableOrder) =>
    o.doctor_name && o.doctor_name !== o.customer_name && o.customer_type !== 'LAB' ? o.doctor_name : null;

  const outstandingLabel = t('finances.totals.outstanding');
  const billedLabel = t('finances.totals.billed');
  const collectedLabel = t('finances.totals.collected');
  const customersLabel = t('finances.totals.customers');

  return (
    <>
      <PageHeader
        title={t('finances.title')}
        subtitle={t('finances.subtitle')}
        actions={
          <Button
            size="small"
            variant="outlined"
            startIcon={<Icon name="lock" size={16} />}
            onClick={lock}
          >
            {t('finances.lock.lockNow')}
          </Button>
        }
      />

      <Stack spacing={2.5}>
      {/* ── Squares: every filter but the payment status; a click sets it ── */}
      <StatGrid>
        <StatCard
          dotColor="#DC2626"
          label={outstandingLabel}
          value={formatGEL(squares.outstanding)}
          selected={selectedSquare === 'outstanding'}
          onClick={squares.outstanding > 0 ? () => pickSquare('outstanding') : undefined}
          ariaLabel={showLabel(outstandingLabel, formatGEL(squares.outstanding))}
        />
        <StatCard
          dotColor="#9292FF"
          label={billedLabel}
          value={formatGEL(squares.billed)}
          selected={selectedSquare === 'billed'}
          onClick={squares.billed > 0 ? () => pickSquare('billed') : undefined}
          ariaLabel={showLabel(billedLabel, formatGEL(squares.billed))}
        />
        <StatCard
          dotColor="#16A34A"
          label={collectedLabel}
          value={formatGEL(squares.collected)}
          selected={selectedSquare === 'collected'}
          onClick={squares.collected > 0 ? () => pickSquare('collected') : undefined}
          ariaLabel={showLabel(collectedLabel, formatGEL(squares.collected))}
        />
        <StatCard
          dotColor="#F59E0B"
          label={customersLabel}
          value={String(squares.groups)}
          onClick={
            squares.groups > 0
              ? () => {
                  pickSquare('billed');
                  setScrollToCustomers(true);
                }
              : undefined
          }
          ariaLabel={showLabel(customersLabel, String(squares.groups))}
        />
      </StatGrid>

      <FinanceFilterBar
        filters={filters}
        onChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        onClear={() => setFilters(defaultReceivableFilters)}
        hasFilters={hasFilters}
        moreOpen={moreOpen}
        onMoreOpenChange={setMoreOpen}
      />

      {selectedCustomer && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            color="primary"
            label={t('finances.customers.viewing', { name: selectedCustomer.customer_name })}
            onDelete={() => setFilters({ ...filters, customerId: null })}
          />
        </Stack>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : totals.orders === 0 ? (
        <OrdersEmptyState
          title={hasFilters ? t('finances.filters.noResults') : t('finances.table.empty')}
        />
      ) : (
        <>
          {/* ── By customer ── */}
          {!selectedCustomer && (
            <Box ref={customersRef} sx={{ scrollMarginTop: 80 }}>
            <SectionCard title={t('finances.customers.title')} icon="groups" dense>
              <DataTable
                columns={CUSTOMER_COLUMNS.map((c) => ({
                  ...c,
                  label: t(`finances.customers.${c.key}`),
                }))}
                minWidth={620}
                sx={{ border: 0, borderRadius: 0 }}
              >
                {(byCustomer.data ?? []).map((c) => (
                  <DataRow key={`${c.customer_type}:${c.customer_id}`} columns={CUSTOMER_COLUMNS}>
                    <Box sx={{ minWidth: 0 }}>
                      <Link
                        component="button"
                        underline="hover"
                        onClick={() => setFilters({ ...filters, customerId: c.customer_id })}
                        sx={{ textAlign: 'left', fontSize: '0.8125rem', fontWeight: 600 }}
                      >
                        {c.customer_name}
                      </Link>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {t(`finances.filters.${CUSTOMER_TYPE_LABEL[c.customer_type] ?? 'doctor'}`)}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.8125rem', textAlign: 'right' }}>
                      {Number(c.order_count)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.8125rem', textAlign: 'right' }}>
                      {formatGEL(Number(c.total_billed))}
                    </Typography>
                    <Typography sx={{ fontSize: '0.8125rem', textAlign: 'right' }}>
                      {formatGEL(Number(c.total_paid))}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        textAlign: 'right',
                        color: 'error.main',
                      }}
                    >
                      {formatGEL(Number(c.total_outstanding))}
                    </Typography>
                  </DataRow>
                ))}
              </DataTable>
            </SectionCard>
            </Box>
          )}

          {/* ── Receivable orders: a table from `md` up, cards below ── */}
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <DataTable
              columns={ORDER_COLUMNS.map((c) =>
                c.key === 'record' ? c : { ...c, label: t(`finances.table.${c.key}`) },
              )}
              minWidth={960}
              footer={
                <Box sx={{ width: '100%' }}>
                  <OrdersPaginator
                    page={page}
                    pageSize={pageSize}
                    total={totalCount}
                    onPageChange={setPage}
                    onPageSizeChange={(s) => {
                      setPageSize(s);
                      setPage(1);
                    }}
                  />
                </Box>
              }
            >
              {(list.data ?? []).map((o) => {
                const order = { ...o, status: o.order_status };
                return (
                  <DataRow
                    key={o.order_id}
                    columns={ORDER_COLUMNS}
                    onClick={() => navigate(`/lab/orders/${o.order_id}`)}
                  >
                    <OrderCodeCell code={o.order_code} />
                    <PatientCell name={o.patient_name || '—'} />
                    <CustomerCell
                      name={o.customer_name}
                      fromLab={o.customer_type === 'LAB'}
                      detail={doctorDetail(o)}
                    />
                    <TextCell>{o.service_name}</TextCell>
                    <DueCell order={order} dates={rowDates} side="lab" />
                    <OrderStatusCell status={o.order_status} completedAt={o.completed_at} side="lab" />
                    <AmountCell value={formatGEL(Number(o.final_total))} />
                    <AmountCell value={formatGEL(Number(o.paid_total))} />
                    <AmountCell
                      value={formatGEL(Number(o.outstanding))}
                      owed
                      amount={Number(o.outstanding)}
                    >
                      <PaymentStatusChip status={o.payment_status} />
                      {isOverdue(o) && (
                        <StatusPill tone="danger">{t('finances.table.overdue')}</StatusPill>
                      )}
                    </AmountCell>
                    {recordButton(o)}
                  </DataRow>
                );
              })}
            </DataTable>
          </Box>

          <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>
            {(list.data ?? []).map((o) => (
              <FinanceOrderCard
                key={o.order_id}
                order={o}
                href={`/lab/orders/${o.order_id}`}
                side="lab"
                service={o.service_name}
                who={[o.patient_name, o.customer_name].filter(Boolean).join(' · ')}
                fromLab={o.customer_type === 'LAB'}
                amounts={{
                  billed: Number(o.final_total),
                  paid: Number(o.paid_total),
                  outstanding: Number(o.outstanding),
                }}
                labels={moneyLabels}
                overdue={isOverdue(o)}
                actions={
                  <Button size="small" variant="outlined" onClick={() => setPayingOrder(o)}>
                    {t('finances.table.record')}
                  </Button>
                }
              />
            ))}
            <OrdersPaginator
              page={page}
              pageSize={pageSize}
              total={totalCount}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </Stack>
        </>
      )}

      <RecordPaymentDialog
        order={payingOrder}
        open={payingOrder !== null}
        onClose={() => setPayingOrder(null)}
        onSaved={() => {
          setPayingOrder(null);
          refetchAll();
        }}
      />
      </Stack>
    </>
  );
}
