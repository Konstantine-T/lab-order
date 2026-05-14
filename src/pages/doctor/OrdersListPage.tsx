import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  InputAdornment,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { DatePicker } from '@mui/x-date-pickers';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import { formatGEL } from '@/utils/pricing';
import { OrderRowCard } from '@/features/orders/OrderRowCard';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import { OrdersPaginator } from '@/features/orders/OrdersPaginator';
import type { OrderRow, OrderStatus } from '@/types/database';

const ALL_STATUSES: readonly OrderStatus[] = [
  'SUBMITTED',
  'RECEIVED',
  'NEEDS_CLARIFICATION',
  'IN_PROGRESS',
  'READY_FOR_DELIVERY',
  'SENT_TO_CLINIC',
  'RECEIVED_BY_CLINIC',
  'TRY_IN_PHASE',
  'COMPLETED',
  'CANCELLED',
];

type Row = OrderRow & {
  patients: { first_name: string; last_name: string } | null;
  labs: { public_name: string } | null;
  lab_services: { name: string } | null;
  service_snapshot: { name?: string } | null;
};

export function OrdersListPage() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const doctorId = user?.doctor_profile?.id;
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['doctor-orders', doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_code, status, payment_status, generated_total, final_total, requested_due_date, confirmed_due_date, created_at, service_snapshot, ' +
            'patients(first_name, last_name), labs(public_name), lab_services(name)',
        )
        .eq('doctor_id', doctorId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const hasFilters = !!(search || statuses.length > 0 || dateFrom?.isValid() || dateTo?.isValid());

  const filtered = useMemo(() => {
    let result = orders;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((row) => {
        const patient = row.patients
          ? `${row.patients.first_name} ${row.patients.last_name}`.toLowerCase()
          : '';
        const service = (
          row.lab_services?.name ??
          row.service_snapshot?.name ??
          ''
        ).toLowerCase();
        const lab = (row.labs?.public_name ?? '').toLowerCase();
        return (
          row.order_code.toLowerCase().includes(q) ||
          patient.includes(q) ||
          service.includes(q) ||
          lab.includes(q)
        );
      });
    }
    if (statuses.length > 0) {
      result = result.filter((row) => statuses.includes(row.status as OrderStatus));
    }
    if (dateFrom?.isValid()) {
      const from = dateFrom.format('YYYY-MM-DD');
      result = result.filter((row) => {
        const due = row.confirmed_due_date ?? row.requested_due_date;
        return due != null && due >= from;
      });
    }
    if (dateTo?.isValid()) {
      const to = dateTo.format('YYYY-MM-DD');
      result = result.filter((row) => {
        const due = row.confirmed_due_date ?? row.requested_due_date;
        return due != null && due <= to;
      });
    }
    return result;
  }, [orders, search, statuses, dateFrom, dateTo]);

  const visible = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statuses, dateFrom?.format('YYYY-MM-DD'), dateTo?.format('YYYY-MM-DD')]);

  const clearFilters = () => {
    setSearch('');
    setStatuses([]);
    setDateFrom(null);
    setDateTo(null);
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        spacing={2}
      >
        <Stack>
          <Typography variant="h4" fontWeight={600}>
            {t('orders.title')}
          </Typography>
          {!isLoading && orders.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {hasFilters
                ? t('orders.countFiltered', {
                    count: filtered.length,
                    total: orders.length,
                  })
                : t('orders.count', { count: orders.length })}
            </Typography>
          )}
        </Stack>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          component={RouterLink}
          to="/doctor/marketplace"
          sx={{ alignSelf: { xs: 'flex-start', sm: 'auto' } }}
        >
          {t('orders.newOrder')}
        </Button>
      </Stack>

      {/* ── Filters ── */}
      {!isLoading && orders.length > 0 && (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          flexWrap="wrap"
          useFlexGap
          alignItems={{ sm: 'center' }}
        >
          <TextField
            placeholder={t('orders.filters.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1, minWidth: 220 }}
          />
          <FormControl size="small" sx={{ minWidth: 190 }}>
            <InputLabel>{t('orders.filters.status')}</InputLabel>
            <Select
              multiple
              value={statuses}
              onChange={(e) => setStatuses(e.target.value as OrderStatus[])}
              input={<OutlinedInput label={t('orders.filters.status')} />}
              renderValue={(sel) =>
                sel.length === 0
                  ? ''
                  : sel.map((s) => tc(`orderStatus.${s}`)).join(', ')
              }
            >
              {ALL_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  <Checkbox checked={statuses.includes(s)} size="small" />
                  <ListItemText primary={tc(`orderStatus.${s}`)} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <DatePicker
            label={t('orders.filters.from')}
            value={dateFrom}
            onChange={(d) => setDateFrom(d)}
            format="YYYY-MM-DD"
            slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
          />
          <DatePicker
            label={t('orders.filters.to')}
            value={dateTo}
            onChange={(d) => setDateTo(d)}
            format="YYYY-MM-DD"
            slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
          />
          {hasFilters && (
            <Button size="small" onClick={clearFilters} sx={{ whiteSpace: 'nowrap' }}>
              {t('orders.filters.clear')}
            </Button>
          )}
        </Stack>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : orders.length === 0 ? (
        <OrdersEmptyState
          title={t('orders.empty')}
          action={
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              component={RouterLink}
              to="/doctor/marketplace"
            >
              {t('orders.newOrder')}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <OrdersEmptyState title={t('orders.filters.noResults')} />
      ) : (
        <Stack spacing={2}>
          <Stack spacing={1.5}>
            {visible.map((row) => {
              const patientName = row.patients
                ? `${row.patients.first_name} ${row.patients.last_name}`
                : '—';
              const serviceName =
                row.lab_services?.name ?? row.service_snapshot?.name ?? '';
              const labName = row.labs?.public_name ?? '';
              const hasDiscount =
                row.final_total != null &&
                row.generated_total != null &&
                row.final_total < row.generated_total;
              const total = row.final_total ?? row.generated_total;
              const dueRaw = row.confirmed_due_date ?? row.requested_due_date;
              const due = dueRaw
                ? t('orders.dueOn', {
                    date: dayjs(dueRaw).format('MMM D, YYYY'),
                  })
                : undefined;
              return (
                <OrderRowCard
                  key={row.id}
                  code={row.order_code}
                  primary={patientName}
                  secondary={[serviceName, labName].filter(Boolean).join(' · ')}
                  status={<OrderStatusChip status={row.status} />}
                  paymentStatus={<PaymentStatusChip status={row.payment_status} />}
                  total={total != null ? formatGEL(total) : '—'}
                  originalTotal={hasDiscount ? formatGEL(row.generated_total!) : undefined}
                  dueDate={due}
                  avatarText={patientName}
                  onClick={() => navigate(`/doctor/orders/${row.id}`)}
                />
              );
            })}
          </Stack>
          <OrdersPaginator
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </Stack>
      )}
    </Stack>
  );
}
