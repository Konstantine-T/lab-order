import {
  Button,
  Checkbox,
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
import SearchIcon from '@mui/icons-material/Search';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { InvoiceRecipientType, PaymentStatus } from '@/types/database';
import {
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
};

export function FinanceFilterBar({
  filters,
  onChange,
  sort,
  onSortChange,
  onClear,
  hasFilters,
}: Props) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const set = (patch: Partial<ReceivableFilters>) => onChange({ ...filters, ...patch });

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
        <TextField
          placeholder={t('finances.filters.search')}
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
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
            <MenuItem value="DOCTOR">{t('finances.filters.doctor')}</MenuItem>
            <MenuItem value="CLINIC">{t('finances.filters.clinic')}</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 190 }}>
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
          <InputLabel>{t('finances.filters.sort')}</InputLabel>
          <Select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as ReceivableSort)}
            input={<OutlinedInput label={t('finances.filters.sort')} />}
          >
            {RECEIVABLE_SORTS.map((s) => (
              <MenuItem key={s} value={s}>
                {t(`finances.sort.${s}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap alignItems={{ sm: 'center' }}>
        <DatePicker
          label={t('finances.filters.from')}
          value={filters.dateFrom ? dayjs(filters.dateFrom) : null}
          onChange={(d) => set({ dateFrom: d && d.isValid() ? d.format('YYYY-MM-DD') : null })}
          format="YYYY-MM-DD"
          slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
        />
        <DatePicker
          label={t('finances.filters.to')}
          value={filters.dateTo ? dayjs(filters.dateTo) : null}
          onChange={(d) => set({ dateTo: d && d.isValid() ? d.format('YYYY-MM-DD') : null })}
          format="YYYY-MM-DD"
          slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
        />
        <TextField
          type="number"
          label={t('finances.filters.minAmount')}
          value={filters.minAmount ?? ''}
          onChange={(e) => set({ minAmount: e.target.value === '' ? null : Number(e.target.value) })}
          size="small"
          sx={{ width: 130 }}
        />
        <TextField
          type="number"
          label={t('finances.filters.maxAmount')}
          value={filters.maxAmount ?? ''}
          onChange={(e) => set({ maxAmount: e.target.value === '' ? null : Number(e.target.value) })}
          size="small"
          sx={{ width: 130 }}
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
        {hasFilters && (
          <Button size="small" onClick={onClear} sx={{ whiteSpace: 'nowrap' }}>
            {t('finances.filters.clear')}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
