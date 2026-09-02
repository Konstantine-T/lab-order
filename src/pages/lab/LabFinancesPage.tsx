import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
  Stack,
  Typography,
} from '@mui/material';
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
import { RecordPaymentDialog } from '@/features/lab/finances/RecordPaymentDialog';
import { useFinanceLock } from '@/features/lab/finances/FinanceLockGate';
import { FinanceFilterBar } from '@/features/lab/finances/FinanceFilterBar';
import {
  defaultReceivableFilters,
  fetchReceivablesByCustomer,
  fetchReceivablesList,
  type ReceivableFilters,
  type ReceivableSort,
} from '@/features/lab/finances/financeApi';
import type { LabReceivableOrder } from '@/types/database';

const CUSTOMER_COLUMNS: Column[] = [
  { key: 'customer', width: 'minmax(0, 2fr)' },
  { key: 'orders', width: '80px', align: 'right' },
  { key: 'billed', width: '110px', align: 'right' },
  { key: 'paid', width: '110px', align: 'right' },
  { key: 'outstanding', width: '120px', align: 'right' },
];

const ORDER_COLUMNS: Column[] = [
  { key: 'order', width: '96px' },
  { key: 'customer', width: 'minmax(0, 1.2fr)' },
  { key: 'service', width: 'minmax(0, 1.2fr)' },
  { key: 'due', width: '116px' },
  { key: 'billed', width: '96px', align: 'right' },
  { key: 'paid', width: '96px', align: 'right' },
  { key: 'outstanding', width: '104px', align: 'right' },
  { key: 'status', width: '104px' },
  { key: 'record', width: '92px', align: 'right' },
];

function isOverdue(o: LabReceivableOrder): boolean {
  return (
    !!o.confirmed_due_date &&
    dayjs(o.confirmed_due_date).isBefore(dayjs(), 'day') &&
    Number(o.outstanding) > 0
  );
}

export function LabFinancesPage() {
  const { t } = useTranslation('lab');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const qc = useQueryClient();
  const { lock } = useFinanceLock();

  const [filters, setFilters] = useState<ReceivableFilters>(defaultReceivableFilters);
  const [sort, setSort] = useState<ReceivableSort>('created_desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [payingOrder, setPayingOrder] = useState<LabReceivableOrder | null>(null);

  useEffect(() => {
    setPage(1);
  }, [filters, sort, pageSize]);

  const byCustomer = useQuery({
    queryKey: ['lab-receivables-by-customer', labId, filters],
    enabled: !!labId,
    queryFn: () => fetchReceivablesByCustomer(labId!, filters),
  });

  const list = useQuery({
    queryKey: ['lab-receivables-list', labId, filters, sort, page, pageSize],
    enabled: !!labId,
    queryFn: () => fetchReceivablesList(labId!, filters, sort, page, pageSize),
  });

  const totals = useMemo(() => {
    const rows = byCustomer.data ?? [];
    return {
      outstanding: rows.reduce((s, r) => s + Number(r.total_outstanding), 0),
      billed: rows.reduce((s, r) => s + Number(r.total_billed), 0),
      collected: rows.reduce((s, r) => s + Number(r.total_paid), 0),
      customers: rows.length,
      orders: rows.reduce((s, r) => s + Number(r.order_count), 0),
    };
  }, [byCustomer.data]);

  const hasFilters =
    filters.search.trim() !== '' ||
    filters.recipientType !== null ||
    filters.customerId !== null ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.overdueOnly ||
    filters.minAmount !== null ||
    filters.maxAmount !== null ||
    filters.statuses.length !== defaultReceivableFilters.statuses.length;

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

  const loading = byCustomer.isLoading || list.isLoading;

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
      {/* ── Totals ── */}
      <StatGrid>
        <StatCard
          dotColor="#DC2626"
          label={t('finances.totals.outstanding')}
          value={formatGEL(totals.outstanding)}
        />
        <StatCard
          dotColor="#9292FF"
          label={t('finances.totals.billed')}
          value={formatGEL(totals.billed)}
        />
        <StatCard
          dotColor="#16A34A"
          label={t('finances.totals.collected')}
          value={formatGEL(totals.collected)}
        />
        <StatCard
          dotColor="#F59E0B"
          label={t('finances.totals.customers')}
          value={String(totals.customers)}
        />
      </StatGrid>

      <FinanceFilterBar
        filters={filters}
        onChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        onClear={() => setFilters(defaultReceivableFilters)}
        hasFilters={hasFilters}
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
                        {t(`finances.filters.${c.customer_type === 'CLINIC' ? 'clinic' : 'doctor'}`)}
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
          )}

          {/* ── Receivable orders ── */}
          <DataTable
            columns={ORDER_COLUMNS.map((c) =>
              c.key === 'record' ? c : { ...c, label: t(`finances.table.${c.key}`) },
            )}
            minWidth={980}
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
              <DataRow key={o.order_id} columns={ORDER_COLUMNS}>
                <Typography
                  sx={{ fontSize: '0.78125rem', fontWeight: 700, color: 'primary.dark' }}
                  noWrap
                >
                  {o.order_code}
                </Typography>
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }} noWrap>
                  {o.customer_name}
                </Typography>
                <Typography variant="body1" color="text.secondary" noWrap>
                  {o.service_name || '—'}
                </Typography>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="body1" noWrap>
                    {o.confirmed_due_date ? dayjs(o.confirmed_due_date).format('MMM D') : '—'}
                  </Typography>
                  {isOverdue(o) && (
                    <StatusPill tone="danger">{t('finances.table.overdue')}</StatusPill>
                  )}
                </Stack>
                <Typography sx={{ fontSize: '0.8125rem', textAlign: 'right' }}>
                  {formatGEL(Number(o.final_total))}
                </Typography>
                <Typography sx={{ fontSize: '0.8125rem', textAlign: 'right' }}>
                  {formatGEL(Number(o.paid_total))}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    textAlign: 'right',
                    color: 'error.main',
                  }}
                >
                  {formatGEL(Number(o.outstanding))}
                </Typography>
                <PaymentStatusChip status={o.payment_status} />
                <Box sx={{ textAlign: 'right' }}>
                  <Button size="small" onClick={() => setPayingOrder(o)}>
                    {t('finances.table.record')}
                  </Button>
                </Box>
              </DataRow>
            ))}
          </DataTable>
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
