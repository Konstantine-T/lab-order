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
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import type { ClinicDoctorRow, InvoiceRecipientType, PaymentStatus } from '@/types/database';
import { PAYABLE_SORTS, type PayableFilters, type PayableSort } from './financeApi';

const PAYMENT_STATUSES: readonly PaymentStatus[] = ['UNPAID', 'PARTIALLY_PAID', 'PAID'];

type Props = {
  filters: PayableFilters;
  onChange: (next: PayableFilters) => void;
  sort: PayableSort;
  onSortChange: (sort: PayableSort) => void;
  onClear: () => void;
  hasFilters: boolean;
  doctors: ClinicDoctorRow[];
  labs: { id: string; name: string }[];
};

/**
 * The clinic's finance filters.
 *
 * Same two-row shape as the lab's bar, with the dimensions swapped for this
 * side of the transaction: which doctor ran up the charge, and which lab is
 * owed. The lab list is derived from the orders themselves rather than the
 * marketplace, so it only ever offers labs this clinic has actually used.
 */
export function ClinicFinanceFilterBar({
  filters,
  onChange,
  sort,
  onSortChange,
  onClear,
  hasFilters,
  doctors,
  labs,
}: Props) {
  const { t } = useTranslation('clinic');
  const { t: tc } = useTranslation('common');
  const set = (patch: Partial<PayableFilters>) => onChange({ ...filters, ...patch });

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
                <Icon name="search" size={18} />
              </InputAdornment>
            ),
          }}
          sx={{ flex: 1, minWidth: 220 }}
        />

        <FormControl size="small" sx={{ minWidth: 175 }}>
          <InputLabel>{t('finances.filters.doctor')}</InputLabel>
          <Select
            value={filters.doctorId ?? ''}
            onChange={(e) => set({ doctorId: e.target.value || null })}
            input={<OutlinedInput label={t('finances.filters.doctor')} />}
          >
            <MenuItem value="">{t('finances.filters.any')}</MenuItem>
            {doctors.map((d) => (
              <MenuItem key={d.doctor_id} value={d.doctor_id}>
                {d.first_name} {d.last_name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 175 }}>
          <InputLabel>{t('finances.filters.lab')}</InputLabel>
          <Select
            value={filters.labId ?? ''}
            onChange={(e) => set({ labId: e.target.value || null })}
            input={<OutlinedInput label={t('finances.filters.lab')} />}
          >
            <MenuItem value="">{t('finances.filters.any')}</MenuItem>
            {labs.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name}
              </MenuItem>
            ))}
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

        <FormControl size="small" sx={{ minWidth: 165 }}>
          <InputLabel>{t('finances.filters.sort')}</InputLabel>
          <Select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as PayableSort)}
            input={<OutlinedInput label={t('finances.filters.sort')} />}
          >
            {PAYABLE_SORTS.map((s) => (
              <MenuItem key={s} value={s}>
                {t(`finances.sort.${s}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        flexWrap="wrap"
        useFlexGap
        alignItems={{ sm: 'center' }}
      >
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>{t('finances.filters.billedTo')}</InputLabel>
          <Select
            value={filters.recipientType ?? ''}
            onChange={(e) =>
              set({ recipientType: (e.target.value || null) as InvoiceRecipientType | null })
            }
            input={<OutlinedInput label={t('finances.filters.billedTo')} />}
          >
            <MenuItem value="">{t('finances.filters.any')}</MenuItem>
            <MenuItem value="CLINIC">{t('finances.filters.theClinic')}</MenuItem>
            <MenuItem value="DOCTOR">{t('finances.filters.theDoctor')}</MenuItem>
          </Select>
        </FormControl>

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
