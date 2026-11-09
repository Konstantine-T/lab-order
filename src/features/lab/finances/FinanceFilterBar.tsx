import {
  Button,
  Checkbox,
  Collapse,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { MoreFiltersButton } from '@/components/MoreFiltersButton';
import { statusLabel } from '@/features/orders/statusLabel';
import type { InvoiceRecipientType, OrderStatus, PaymentStatus } from '@/types/database';
import {
  CUSTOMER_TYPE_LABEL,
  hiddenReceivableFilterCount,
  RECEIVABLE_ORDER_STATUSES,
  RECEIVABLE_SORTS,
  type ReceivableFilters,
  type ReceivableSort,
} from './financeApi';

const PAYMENT_STATUSES: readonly PaymentStatus[] = ['UNPAID', 'PARTIALLY_PAID', 'PAID'];

type Props = {
  filters: ReceivableFilters;
  onChange: (next: ReceivableFilters) => void;
  sort: ReceivableSort;
  onSortChange: (sort: ReceivableSort) => void;
  onClear: () => void;
  hasFilters: boolean;
  /** The "More filters" panel, owned by the page so a preset can open it. */
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
};

/**
 * The lab's finance filters: search, order status, payment status and sort
 * always in view; customer type, the completed dates, the amounts and
 * "overdue only" behind "More filters", whose button says how many of those
 * are set.
 */
export function FinanceFilterBar({
  filters,
  onChange,
  sort,
  onSortChange,
  onClear,
  hasFilters,
  moreOpen,
  onMoreOpenChange,
}: Props) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const set = (patch: Partial<ReceivableFilters>) => onChange({ ...filters, ...patch });

  return (
    <Stack spacing={1.5}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        flexWrap="wrap"
        useFlexGap
        alignItems={{ sm: 'center' }}
      >
        <TextField
          placeholder={t('finances.filters.search')}
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Icon name="search" size={18} />
              </InputAdornment>
            ),
          }}
          sx={{ flex: 1, minWidth: 220 }}
        />

        {/* Capped so a long selection ellipsises instead of widening the row. */}
        <FormControl size="small" sx={{ minWidth: 180, maxWidth: { sm: 260 } }}>
          <InputLabel>{t('finances.filters.orderStatus')}</InputLabel>
          <Select
            multiple
            value={filters.orderStatuses}
            onChange={(e) => set({ orderStatuses: e.target.value as OrderStatus[] })}
            input={<OutlinedInput label={t('finances.filters.orderStatus')} />}
            renderValue={(sel) => sel.map((s) => statusLabel(s, tc, 'lab')).join(', ')}
          >
            {RECEIVABLE_ORDER_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                <Checkbox checked={filters.orderStatuses.includes(s)} size="small" />
                <ListItemText primary={statusLabel(s, tc, 'lab')} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180, maxWidth: { sm: 260 } }}>
          <InputLabel>{t('finances.filters.status')}</InputLabel>
          <Select
            multiple
            value={filters.statuses}
            onChange={(e) => set({ statuses: e.target.value as PaymentStatus[] })}
            input={<OutlinedInput label={t('finances.filters.status')} />}
            renderValue={(sel) => sel.map((s) => tc(`paymentStatus.${s}`)).join(', ')}
          >
            {PAYMENT_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                <Checkbox checked={filters.statuses.includes(s)} size="small" />
                <ListItemText primary={tc(`paymentStatus.${s}`)} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{tc('orderSort.label')}</InputLabel>
          <Select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as ReceivableSort)}
            input={<OutlinedInput label={tc('orderSort.label')} />}
          >
            {RECEIVABLE_SORTS.map((s) => (
              <MenuItem key={s} value={s}>
                {/* The created and due sorts share the order lists' labels;
                    the amount and completed ones are finance-specific. */}
                {s.startsWith('created') || s.startsWith('due') ? tc(`orderSort.${s}`) : t(`finances.sort.${s}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Stack direction="row" spacing={1} alignItems="center">
          <MoreFiltersButton
            open={moreOpen}
            onToggle={() => onMoreOpenChange(!moreOpen)}
            activeCount={hiddenReceivableFilterCount(filters)}
          />
          {hasFilters && (
            <Button size="small" onClick={onClear} sx={{ whiteSpace: 'nowrap' }}>
              {t('finances.filters.clear')}
            </Button>
          )}
        </Stack>
      </Stack>

      <Collapse in={moreOpen}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          flexWrap="wrap"
          useFlexGap
          alignItems={{ sm: 'center' }}
        >
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('finances.filters.recipientType')}</InputLabel>
            <Select
              value={filters.recipientType ?? ''}
              onChange={(e) =>
                set({ recipientType: (e.target.value || null) as InvoiceRecipientType | null })
              }
              input={<OutlinedInput label={t('finances.filters.recipientType')} />}
            >
              <MenuItem value="">{t('finances.filters.any')}</MenuItem>
              {(Object.keys(CUSTOMER_TYPE_LABEL) as InvoiceRecipientType[]).map((type) => (
                <MenuItem key={type} value={type}>
                  {t(`finances.filters.${CUSTOMER_TYPE_LABEL[type]}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <DatePicker
            label={t('finances.filters.completedFrom')}
            value={filters.dateFrom ? dayjs(filters.dateFrom) : null}
            onChange={(d) => set({ dateFrom: d && d.isValid() ? d.format('YYYY-MM-DD') : null })}
            format="YYYY-MM-DD"
            slotProps={{ textField: { size: 'small', sx: { width: { xs: '100%', sm: 170 } } } }}
          />
          <DatePicker
            label={t('finances.filters.completedTo')}
            value={filters.dateTo ? dayjs(filters.dateTo) : null}
            onChange={(d) => set({ dateTo: d && d.isValid() ? d.format('YYYY-MM-DD') : null })}
            format="YYYY-MM-DD"
            slotProps={{ textField: { size: 'small', sx: { width: { xs: '100%', sm: 170 } } } }}
          />
          <TextField
            type="number"
            label={t('finances.filters.minAmount')}
            value={filters.minAmount ?? ''}
            onChange={(e) => set({ minAmount: e.target.value === '' ? null : Number(e.target.value) })}
            size="small"
            sx={{ width: { xs: '100%', sm: 130 } }}
          />
          <TextField
            type="number"
            label={t('finances.filters.maxAmount')}
            value={filters.maxAmount ?? ''}
            onChange={(e) => set({ maxAmount: e.target.value === '' ? null : Number(e.target.value) })}
            size="small"
            sx={{ width: { xs: '100%', sm: 130 } }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={filters.overdueOnly}
                onChange={(e) => set({ overdueOnly: e.target.checked })}
                size="small"
              />
            }
            label={t('finances.filters.overdueOnly')}
          />
        </Stack>
      </Collapse>
    </Stack>
  );
}
