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
import SearchIcon from '@mui/icons-material/Search';
import { DatePicker } from '@mui/x-date-pickers';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { OrderStatusChip } from '@/components/OrderStatusChip';
import { formatGEL } from '@/utils/pricing';
import { OrderRowCard } from '@/features/orders/OrderRowCard';
import { OrdersEmptyState } from '@/features/orders/OrdersEmptyState';
import { OrdersPaginator } from '@/features/orders/OrdersPaginator';
import type { OrderRow, OrderStatus } from '@/types/database';
import { LAB_SELECTABLE_STATUSES } from '@/types/database';

const FILTERABLE_STATUSES: readonly OrderStatus[] = [
  'SUBMITTED',
  'RECEIVED',
  'NEEDS_CLARIFICATION',
  'IN_PROGRESS',
  'READY_FOR_DELIVERY',
  'SENT_TO_CLINIC',
  'COMPLETED',
  'CANCELLED',
] as const;

type Row = OrderRow & {
  lab_services: { name: string } | null;
  service_snapshot: { name?: string } | null;
};

export function LabOrdersDashboardPage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lab-orders', labId] }),
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const location = useLocation();

  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(() => {
    const s = location.state as { dueFrom?: string; dueTo?: string } | null;
    return s?.dueFrom ? dayjs(s.dueFrom) : null;
  });
  const [dateTo, setDateTo] = useState<Dayjs | null>(() => {
    const s = location.state as { dueFrom?: string; dueTo?: string } | null;
    return s?.dueTo ? dayjs(s.dueTo) : null;
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['lab-orders', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_code, status, generated_total, final_total, requested_due_date, confirmed_due_date, created_at, service_snapshot, doctor_snapshot, ' +
            'lab_services(name)',
        )
        .eq('lab_id', labId!)
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
        const ds = row.doctor_snapshot ?? {};
        const doctor = [ds.first_name, ds.last_name].filter(Boolean).join(' ').toLowerCase();
        const service = (
          row.lab_services?.name ??
          row.service_snapshot?.name ??
          ''
        ).toLowerCase();
        return (
          row.order_code.toLowerCase().includes(q) ||
          doctor.includes(q) ||
          service.includes(q)
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
      <Stack>
        <Typography variant="h4" fontWeight={600}>
          {t('ordersDashboard.title')}
        </Typography>
        {!isLoading && orders.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            {hasFilters
              ? t('ordersDashboard.countFiltered', {
                  count: filtered.length,
                  total: orders.length,
                })
              : t('ordersDashboard.count', { count: orders.length })}
          </Typography>
        )}
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
            placeholder={t('ordersDashboard.filters.search')}
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
            <InputLabel>{t('ordersDashboard.filters.status')}</InputLabel>
            <Select
              multiple
              value={statuses}
              onChange={(e) => setStatuses(e.target.value as OrderStatus[])}
              input={<OutlinedInput label={t('ordersDashboard.filters.status')} />}
              renderValue={(sel) =>
                sel.length === 0
                  ? ''
                  : sel.map((s) => tc(`orderStatus.${s}`)).join(', ')
              }
            >
              {FILTERABLE_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  <Checkbox checked={statuses.includes(s)} size="small" />
                  <ListItemText primary={tc(`orderStatus.${s}`)} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <DatePicker
            label={t('ordersDashboard.filters.from')}
            value={dateFrom}
            onChange={(d) => setDateFrom(d)}
            format="YYYY-MM-DD"
            slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
          />
          <DatePicker
            label={t('ordersDashboard.filters.to')}
            value={dateTo}
            onChange={(d) => setDateTo(d)}
            format="YYYY-MM-DD"
            slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
          />
          {hasFilters && (
            <Button size="small" onClick={clearFilters} sx={{ whiteSpace: 'nowrap' }}>
              {t('ordersDashboard.filters.clear')}
            </Button>
          )}
        </Stack>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : orders.length === 0 ? (
        <OrdersEmptyState title={t('ordersDashboard.empty')} />
      ) : filtered.length === 0 ? (
        <OrdersEmptyState title={t('ordersDashboard.filters.noResults')} />
      ) : (
        <Stack spacing={2}>
          <Stack spacing={1.5}>
            {visible.map((row) => {
              const ds = row.doctor_snapshot ?? {};
              const doctorName =
                [ds.first_name, ds.last_name].filter(Boolean).join(' ') || '—';
              const serviceName =
                row.lab_services?.name ?? row.service_snapshot?.name ?? '';
              const total = row.final_total ?? row.generated_total;
              const dueRaw = row.confirmed_due_date ?? row.requested_due_date;
              const due = dueRaw
                ? t('ordersDashboard.dueOn', {
                    date: dayjs(dueRaw).format('MMM D, YYYY'),
                  })
                : undefined;
              return (
                <OrderRowCard
                  key={row.id}
                  code={row.order_code}
                  primary={doctorName}
                  secondary={serviceName}
                  status={<OrderStatusChip status={row.status} />}
                  total={total != null ? formatGEL(total) : '—'}
                  dueDate={due}
                  avatarText={doctorName}
                  onClick={() => navigate(`/lab/orders/${row.id}`)}
                  footer={
                    <Stack
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      sx={{ px: 2.5, py: 1.25 }}
                    >
                      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {t('orderSheet.statusTitle')}:
                      </Typography>
                      <Select
                        size="small"
                        value={row.status}
                        onChange={(e) =>
                          updateStatus.mutate({
                            orderId: row.id,
                            status: e.target.value as OrderStatus,
                          })
                        }
                        disabled={updateStatus.isPending}
                        sx={{ minWidth: 220 }}
                      >
                        {LAB_SELECTABLE_STATUSES.map((s) => (
                          <MenuItem key={s} value={s}>
                            {tc(`orderStatus.${s}`)}
                          </MenuItem>
                        ))}
                      </Select>
                    </Stack>
                  }
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
