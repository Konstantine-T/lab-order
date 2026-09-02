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

const ORDER_COLUMNS: Column[] = [
  { key: 'order', width: '96px' },
  { key: 'doctor', width: 'minmax(0, 1fr)' },
  { key: 'lab', width: 'minmax(0, 1fr)' },
  { key: 'patient', width: 'minmax(0, 1fr)' },
  { key: 'due', width: '116px' },
  { key: 'billed', width: '96px', align: 'right' },
  { key: 'paid', width: '96px', align: 'right' },
  { key: 'outstanding', width: '104px', align: 'right' },
  { key: 'status', width: '104px' },
];

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
 * table underneath.
 */
export function ClinicFinancesPage() {
  const { t } = useTranslation('clinic');
  const { user } = useAuth();
  const clinicId = user?.clinic?.id;
  const navigate = useNavigate();

  const [filters, setFilters] = useState<PayableFilters>(defaultPayableFilters);
  const [sort, setSort] = useState<PayableSort>('outstanding_desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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
      const rows = await fetchPayablesList(
        { ...defaultPayableFilters, statuses: [] },
        'created_desc',
        1,
        500,
      );
      const seen = new Map<string, string>();
      for (const r of rows) if (r.lab_id && !seen.has(r.lab_id)) seen.set(r.lab_id, r.lab_name);
      return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const totals = useMemo(() => {
    const rows = byDoctor.data ?? [];
    return {
      outstanding: rows.reduce((s, r) => s + Number(r.total_outstanding), 0),
      billed: rows.reduce((s, r) => s + Number(r.total_billed), 0),
      paid: rows.reduce((s, r) => s + Number(r.total_paid), 0),
      doctors: rows.length,
      orders: rows.reduce((s, r) => s + Number(r.order_count), 0),
    };
  }, [byDoctor.data]);

  const hasFilters =
    filters.search.trim() !== '' ||
    filters.doctorId !== null ||
    filters.labId !== null ||
    filters.recipientType !== null ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.overdueOnly ||
    filters.minAmount !== null ||
    filters.maxAmount !== null ||
    filters.statuses.length !== defaultPayableFilters.statuses.length;

  const totalCount = list.data?.[0]?.total_count ? Number(list.data[0].total_count) : 0;
  const selectedDoctor =
    filters.doctorId != null
      ? (byDoctor.data ?? []).find((d) => d.doctor_id === filters.doctorId)
      : undefined;

  const loading = byDoctor.isLoading || list.isLoading;

  return (
    <>
      <PageHeader title={t('finances.title')} subtitle={t('finances.subtitle')} />

      <Stack spacing={2.5}>
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
            label={t('finances.totals.paid')}
            value={formatGEL(totals.paid)}
          />
          <StatCard
            dotColor="#F59E0B"
            label={t('finances.totals.orders')}
            value={String(totals.orders)}
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

            <DataTable
              columns={ORDER_COLUMNS.map((c) => ({ ...c, label: t(`finances.table.${c.key}`) }))}
              minWidth={1060}
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
                  <Typography
                    sx={{ fontSize: '0.78125rem', fontWeight: 700, color: 'primary.dark' }}
                    noWrap
                  >
                    {o.order_code}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }} noWrap>
                    {o.doctor_name}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" noWrap>
                    {o.lab_name || '—'}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" noWrap>
                    {o.patient_name || '—'}
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
                    {formatGEL(Number(o.billed))}
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
                </DataRow>
              ))}
            </DataTable>

            {/* Said once, at the bottom, so nobody hunts for a button that is
                deliberately not here. */}
            <Callout tone="info">{t('finances.readOnlyNote')}</Callout>
          </>
        )}
      </Stack>
    </>
  );
}
