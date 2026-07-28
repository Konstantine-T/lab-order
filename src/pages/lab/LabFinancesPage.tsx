import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { formatGEL } from '@/utils/pricing';
import { PaymentStatusChip } from '@/components/OrderStatusChip';
import { OrdersPaginator } from '@/features/orders/OrdersPaginator';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import { RecordPaymentDialog } from '@/features/lab/finances/RecordPaymentDialog';
import { FinanceFilterBar } from '@/features/lab/finances/FinanceFilterBar';
import {
  defaultReceivableFilters,
  fetchReceivablesByCustomer,
  fetchReceivablesList,
  type ReceivableFilters,
  type ReceivableSort,
} from '@/features/lab/finances/financeApi';
import type { LabReceivableOrder } from '@/types/database';

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Typography variant="body2" color="text.secondary" noWrap>
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700} color={accent ? 'error.main' : 'text.primary'}>
        {value}
      </Typography>
    </Paper>
  );
}

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
    <Stack spacing={3}>
      <Stack>
        <Typography variant="h4" fontWeight={600}>
          {t('finances.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('finances.subtitle')}
        </Typography>
      </Stack>

      {/* ── Totals ── */}
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatCard label={t('finances.totals.outstanding')} value={formatGEL(totals.outstanding)} accent />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label={t('finances.totals.billed')} value={formatGEL(totals.billed)} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label={t('finances.totals.collected')} value={formatGEL(totals.collected)} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard
            label={t('finances.totals.customers')}
            value={String(totals.customers)}
          />
        </Grid>
      </Grid>

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
            <Paper variant="outlined">
              <Typography variant="subtitle1" fontWeight={600} sx={{ px: 2, pt: 2 }}>
                {t('finances.customers.title')}
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('finances.customers.customer')}</TableCell>
                      <TableCell align="right">{t('finances.customers.orders')}</TableCell>
                      <TableCell align="right">{t('finances.customers.billed')}</TableCell>
                      <TableCell align="right">{t('finances.customers.paid')}</TableCell>
                      <TableCell align="right">{t('finances.customers.outstanding')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(byCustomer.data ?? []).map((c) => (
                      <TableRow key={`${c.customer_type}:${c.customer_id}`} hover>
                        <TableCell>
                          <Link
                            component="button"
                            underline="hover"
                            onClick={() => setFilters({ ...filters, customerId: c.customer_id })}
                            sx={{ textAlign: 'left' }}
                          >
                            {c.customer_name}
                          </Link>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {t(`finances.filters.${c.customer_type === 'CLINIC' ? 'clinic' : 'doctor'}`)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{Number(c.order_count)}</TableCell>
                        <TableCell align="right">{formatGEL(Number(c.total_billed))}</TableCell>
                        <TableCell align="right">{formatGEL(Number(c.total_paid))}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600} color="error.main">
                            {formatGEL(Number(c.total_outstanding))}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* ── Receivable orders ── */}
          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('finances.table.order')}</TableCell>
                    <TableCell>{t('finances.table.customer')}</TableCell>
                    <TableCell>{t('finances.table.service')}</TableCell>
                    <TableCell>{t('finances.table.due')}</TableCell>
                    <TableCell align="right">{t('finances.table.billed')}</TableCell>
                    <TableCell align="right">{t('finances.table.paid')}</TableCell>
                    <TableCell align="right">{t('finances.table.outstanding')}</TableCell>
                    <TableCell>{t('finances.table.status')}</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(list.data ?? []).map((o) => (
                    <TableRow key={o.order_id} hover>
                      <TableCell>{o.order_code}</TableCell>
                      <TableCell>{o.customer_name}</TableCell>
                      <TableCell>{o.service_name || '—'}</TableCell>
                      <TableCell>
                        {o.confirmed_due_date ? (
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <span>{dayjs(o.confirmed_due_date).format('MMM D, YYYY')}</span>
                            {isOverdue(o) && (
                              <Chip label={t('finances.table.overdue')} size="small" color="error" />
                            )}
                          </Stack>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell align="right">{formatGEL(Number(o.final_total))}</TableCell>
                      <TableCell align="right">{formatGEL(Number(o.paid_total))}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600} color="error.main">
                          {formatGEL(Number(o.outstanding))}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <PaymentStatusChip status={o.payment_status} />
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => setPayingOrder(o)}>
                          {t('finances.table.record')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ p: 1 }}>
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
          </Paper>
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
  );
}
