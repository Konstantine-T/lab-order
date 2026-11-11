import { useEffect, useMemo, useState } from 'react';
import { Box, Chip, CircularProgress, Link, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { formatGEL } from '@/utils/pricing';
import { PaymentStatusChip } from '@/components/OrderStatusChip';
import {
  type Column,
  Callout,
  DataRow,
  DataTable,
  PageHeader,
  SectionCard,
  StatCard,
  StatGrid,
  StatusPill,
} from '@/components/design';
import { OrdersPaginator } from '@/features/orders/OrdersPaginator';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import {
  AmountCell,
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
import { ClinicFinanceFilterBar } from '@/features/clinic/finances/ClinicFinanceFilterBar';
import {
  defaultPayableFilters,
  fetchPayablesByDoctor,
  fetchPayablesList,
  type PayableFilters,
  type PayableSort,
} from '@/features/clinic/finances/financeApi';
import type { ClinicDoctorRow, ClinicPayableOrder } from '@/types/database';

const DOCTOR_COLUMNS: Column[] = [
  { key: 'doctor', width: 'minmax(0, 2fr)' },
  { key: 'orders', width: '80px', align: 'right' },
  { key: 'billed', width: '110px', align: 'right' },
  { key: 'paid', width: '110px', align: 'right' },
  { key: 'outstanding', width: '120px', align: 'right' },
];

/**
 * What the clinic's orders list says about an order (patient, doctor, lab,
 * service, due, status), then the money: billed, paid, outstanding, payment.
 */
const ORDER_COLUMNS: Column[] = [
  { key: 'order', width: '84px' },
  { key: 'patient', width: 'minmax(0, 1.1fr)' },
  { key: 'doctor', width: 'minmax(0, 1fr)' },
  { key: 'lab', width: 'minmax(0, 1fr)' },
  { key: 'service', width: 'minmax(0, 1fr)' },
  { key: 'due', width: '120px' },
  // The status pill, with the completed date under it.
  { key: 'orderStatus', width: 'minmax(116px, auto)' },
  { key: 'billed', width: '84px', align: 'right' },
  { key: 'paid', width: '84px', align: 'right' },
  // The payment and overdue pills under the amount; "ნაწილობრივ
  // გადახდილი" is a 176px pill, so `auto` lets it widen the column.
  { key: 'outstanding', width: 'minmax(108px, auto)', align: 'right' },
];

/** Money overdue: past its confirmed date with something still owed. */
function isOverdue(o: ClinicPayableOrder): boolean {
  return (
    !!o.confirmed_due_date &&
    dayjs(o.confirmed_due_date).isBefore(dayjs(), 'day') &&
    Number(o.outstanding) > 0
  );
}

/**
 * What the clinic owes out, the mirror of the lab's receivables page.
 *
 * Read-only on purpose: the lab is the creditor and records payments against
 * its own invoices (0024). This side answers "who ran this up, to which lab,
 * and how much is still open" — so the rollup is per doctor, and every filter
 * narrows the totals, the rollup and the list together rather than just the
 * table underneath. The squares take every filter but the payment status, and
 * clicking one sets it.
 */
export function ClinicFinancesPage() {
  const { t } = useTranslation('clinic');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const clinicId = user?.clinic?.id;
  const navigate = useNavigate();

  const [filters, setFilters] = useState<PayableFilters>(defaultPayableFilters);
  const [sort, setSort] = useState<PayableSort>('outstanding_desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [filters, sort, pageSize]);

  const { data: doctors = [] } = useQuery({
    queryKey: ['clinic-doctors', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('clinic_doctors');
      if (error) throw error;
      return (data ?? []) as ClinicDoctorRow[];
    },
  });

  const byDoctor = useQuery({
    queryKey: ['clinic-payables-by-doctor', clinicId, filters],
    queryFn: () => fetchPayablesByDoctor(filters),
  });

  // The squares: every filter but the payment status (J2). Same key prefix as
  // the rollup, so the live refresh covers it.
  const squareFilters = useMemo(() => ({ ...filters, statuses: [] }), [filters]);
  const squaresQuery = useQuery({
    queryKey: ['clinic-payables-by-doctor', clinicId, squareFilters],
    queryFn: () => fetchPayablesByDoctor(squareFilters),
  });

  const list = useQuery({
    queryKey: ['clinic-payables-list', clinicId, filters, sort, page, pageSize],
    queryFn: () => fetchPayablesList(filters, sort, page, pageSize),
  });

  // The lab options come from the orders themselves, so the dropdown only ever
  // offers labs this clinic has actually ordered from. Unfiltered by design —
  // narrowing to one lab must not empty the list you narrow with.
  const { data: labOptions = [] } = useQuery({
    queryKey: ['clinic-payable-labs', clinicId],
    queryFn: async () => {
      const rows = await fetchPayablesList(defaultPayableFilters, 'created_desc', 1, 500);
      const seen = new Map<string, string>();
      for (const r of rows) if (r.lab_id && !seen.has(r.lab_id)) seen.set(r.lab_id, r.lab_name);
      return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const totals = useMemo(() => squareTotals(byDoctor.data ?? []), [byDoctor.data]);
  const squares = useMemo(() => squareTotals(squaresQuery.data ?? []), [squaresQuery.data]);
  const selectedSquare = selectedPaymentSquare(filters.statuses);

  const hasFilters =
    filters.search.trim() !== '' ||
    filters.doctorId !== null ||
    filters.labId !== null ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.overdueOnly ||
    filters.minAmount !== null ||
    filters.maxAmount !== null ||
    filters.statuses.length > 0 ||
    filters.orderStatuses.length > 0;

  const totalCount = list.data?.[0]?.total_count ? Number(list.data[0].total_count) : 0;
  const selectedDoctor =
    filters.doctorId != null
      ? (byDoctor.data ?? []).find((d) => d.doctor_id === filters.doctorId)
      : undefined;

  const pickSquare = (square: PaymentSquare) =>
    setFilters({ ...filters, statuses: [...SQUARE_PAYMENT_STATUSES[square]] });
  const showLabel = (label: string, value: string) => tc('statCard.show', { label, value });

  const loading = byDoctor.isLoading || list.isLoading;
  const rowDates = queueDates();
  const moneyLabels = {
    billed: t('finances.table.billed'),
    paid: t('finances.table.paid'),
    outstanding: t('finances.table.outstanding'),
    overdue: t('finances.table.overdue'),
  };

  const outstandingLabel = t('finances.totals.outstanding');
  const billedLabel = t('finances.totals.billed');
  const paidLabel = t('finances.totals.paid');
  const ordersLabel = t('finances.totals.orders');

  return (
    <>
      <PageHeader title={t('finances.title')} subtitle={t('finances.subtitle')} />

      <Stack spacing={2.5}>
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
            label={paidLabel}
            value={formatGEL(squares.collected)}
            selected={selectedSquare === 'collected'}
            onClick={squares.collected > 0 ? () => pickSquare('collected') : undefined}
            ariaLabel={showLabel(paidLabel, formatGEL(squares.collected))}
          />
          <StatCard
            dotColor="#F59E0B"
            label={ordersLabel}
            value={String(squares.orders)}
            onClick={squares.orders > 0 ? () => pickSquare('billed') : undefined}
            ariaLabel={showLabel(ordersLabel, String(squares.orders))}
          />
        </StatGrid>

        <ClinicFinanceFilterBar
          filters={filters}
          onChange={setFilters}
          sort={sort}
          onSortChange={setSort}
          onClear={() => setFilters(defaultPayableFilters)}
          hasFilters={hasFilters}
          doctors={doctors}
          labs={labOptions}
          moreOpen={moreOpen}
          onMoreOpenChange={setMoreOpen}
        />

        {selectedDoctor && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              color="primary"
              label={t('finances.doctors.viewing', { name: selectedDoctor.doctor_name })}
              onDelete={() => setFilters({ ...filters, doctorId: null })}
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
            {!selectedDoctor && (
              <SectionCard title={t('finances.doctors.title')} icon="groups" dense>
                <DataTable
                  columns={DOCTOR_COLUMNS.map((c) => ({
                    ...c,
                    label: t(`finances.doctors.${c.key}`),
                  }))}
                  minWidth={620}
                  sx={{ border: 0, borderRadius: 0 }}
                >
                  {(byDoctor.data ?? []).map((d) => (
                    <DataRow key={d.doctor_id} columns={DOCTOR_COLUMNS}>
                      <Box sx={{ minWidth: 0 }}>
                        <Link
                          component="button"
                          underline="hover"
                          onClick={() => setFilters({ ...filters, doctorId: d.doctor_id })}
                          sx={{ textAlign: 'left', fontSize: '0.8125rem', fontWeight: 600 }}
                        >
                          {d.doctor_name}
                        </Link>
                      </Box>
                      <Typography sx={{ fontSize: '0.8125rem', textAlign: 'right' }}>
                        {Number(d.order_count)}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8125rem', textAlign: 'right' }}>
                        {formatGEL(Number(d.total_billed))}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8125rem', textAlign: 'right' }}>
                        {formatGEL(Number(d.total_paid))}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          textAlign: 'right',
                          color: 'error.main',
                        }}
                      >
                        {formatGEL(Number(d.total_outstanding))}
                      </Typography>
                    </DataRow>
                  ))}
                </DataTable>
              </SectionCard>
            )}

            {/* A table from `md` up, the orders list's cards below. */}
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <DataTable
                columns={ORDER_COLUMNS.map((c) => ({ ...c, label: t(`finances.table.${c.key}`) }))}
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
                {(list.data ?? []).map((o) => (
                  <DataRow
                    key={o.order_id}
                    columns={ORDER_COLUMNS}
                    onClick={() => navigate(`/clinic/orders/${o.order_id}`)}
                  >
                    <OrderCodeCell code={o.order_code} />
                    <PatientCell name={o.patient_name || '—'} />
                    <TextCell>{o.doctor_name}</TextCell>
                    <TextCell>{o.lab_name}</TextCell>
                    <TextCell>{o.service_name}</TextCell>
                    <DueCell order={{ ...o, status: o.order_status }} dates={rowDates} side="doctor" />
                    <OrderStatusCell status={o.order_status} completedAt={o.completed_at} side="doctor" />
                    <AmountCell value={formatGEL(Number(o.billed))} />
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
                  </DataRow>
                ))}
              </DataTable>
            </Box>

            <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>
              {(list.data ?? []).map((o) => (
                <FinanceOrderCard
                  key={o.order_id}
                  order={o}
                  href={`/clinic/orders/${o.order_id}`}
                  side="doctor"
                  service={o.service_name}
                  who={[o.patient_name, o.lab_name].filter(Boolean).join(' · ')}
                  doctorName={o.doctor_name}
                  amounts={{
                    billed: Number(o.billed),
                    paid: Number(o.paid_total),
                    outstanding: Number(o.outstanding),
                  }}
                  labels={moneyLabels}
                  overdue={isOverdue(o)}
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

            {/* Said once, at the bottom, so nobody hunts for a button that is
                deliberately not here. */}
            <Callout tone="info">{t('finances.readOnlyNote')}</Callout>
          </>
        )}
      </Stack>
    </>
  );
}
