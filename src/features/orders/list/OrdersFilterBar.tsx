import { useState } from 'react';
import {
  alpha,
  Box,
  Button,
  Checkbox,
  Collapse,
  FormControl,
  InputLabel,
  ListItemText,
  Menu,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import { useTranslation } from 'react-i18next';
import { ChoicePill, Icon } from '@/components/design';
import { brand, motion, radii, surfaces, tone } from '@/theme/tokens';
import type { OrderStatus } from '@/types/database';
import type { FilterOption, QuickFilter } from './orderListModel';
import type { OrderListFilterState } from './useOrderListFilters';

const ALL_STATUSES: readonly OrderStatus[] = [
  'SUBMITTED',
  'RECEIVED',
  'NEEDS_CLARIFICATION',
  'NEEDS_DOCTOR_INPUT',
  'IN_PROGRESS',
  'READY_FOR_DELIVERY',
  'SENT_TO_CLINIC',
  'RECEIVED_BY_CLINIC',
  'TRY_IN_PHASE',
  'COMPLETED',
  'CANCELLED',
];

/**
 * The redesign's "Lab: All ▾" control — a control-height pill that opens a
 * menu of what the loaded orders actually contain.
 */
function FilterMenu({
  label,
  value,
  options,
  onChange,
  showAll,
}: {
  label: string;
  value: string | null;
  options: FilterOption[];
  onChange: (value: string | null) => void;
  /** Spell out "All" when nothing is picked, as the lab menu does. */
  showAll?: boolean;
}) {
  const { t } = useTranslation('common');
  const mode = useTheme().palette.mode;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const picked = options.find((o) => o.value === value);
  const shown = picked?.label ?? (showAll ? t('orderList.quick.all') : null);

  const pick = (next: string | null) => {
    onChange(next);
    setAnchor(null);
  };

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          height: 34,
          px: 1.5,
          maxWidth: 260,
          borderRadius: `${radii.control}px`,
          border: 1,
          borderColor: picked ? 'primary.main' : surfaces[mode].control,
          bgcolor: 'background.paper',
          color: 'text.primary',
          fontFamily: 'inherit',
          fontSize: '0.78125rem',
          fontWeight: 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: `border-color ${motion.fast}`,
          '&:hover': { borderColor: 'primary.main' },
          '&:focus-visible': { outline: 'none', boxShadow: `0 0 0 3px ${alpha(brand.main, 0.28)}` },
        }}
      >
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
          {shown && (
            <>
              {': '}
              <Box component="b" sx={{ fontWeight: 700 }}>
                {shown}
              </Box>
            </>
          )}
        </Box>
        <Icon name="expand_more" size={16} sx={{ color: 'text.secondary' }} />
      </Box>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { maxHeight: 360, minWidth: 200 } } }}
      >
        <MenuItem selected={value == null} onClick={() => pick(null)}>
          {t('orderList.quick.all')}
        </MenuItem>
        {options.map((o) => (
          <MenuItem key={o.value} selected={o.value === value} onClick={() => pick(o.value)}>
            {o.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/**
 * The phone's three metric tiles, which are its quick filters: waiting on you
 * (gold), due this week, ready for pickup (aqua). Tapping the lit one again
 * goes back to everything.
 */
function QuickTiles({
  quick,
  counts,
  onPick,
}: {
  quick: QuickFilter;
  counts: Record<QuickFilter, number>;
  onPick: (q: QuickFilter) => void;
}) {
  const { t } = useTranslation('common');
  const mode = useTheme().palette.mode;
  const tiles: { key: QuickFilter; tint?: 'warning' | 'success' }[] = [
    { key: 'needsAnswer', tint: 'warning' },
    { key: 'dueThisWeek' },
    { key: 'ready', tint: 'success' },
  ];

  return (
    <Box sx={{ display: { xs: 'grid', sm: 'none' }, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
      {tiles.map(({ key, tint }) => {
        const tn = tint ? tone(tint, mode) : null;
        const selected = quick === key;
        return (
          <Box
            key={key}
            component="button"
            type="button"
            aria-pressed={selected}
            onClick={() => onPick(selected ? 'all' : key)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 0.25,
              p: '12px 12px 10px',
              minWidth: 0,
              textAlign: 'left',
              fontFamily: 'inherit',
              cursor: 'pointer',
              borderRadius: `${radii.tile}px`,
              border: selected ? 2 : 1,
              // The chosen tile takes the ink edge every selected control has;
              // keep its box the same size by trimming the padding it adds.
              m: selected ? '-1px' : 0,
              borderColor: selected ? 'primary.main' : (tn?.border ?? surfaces[mode].borderSolid),
              bgcolor: tn?.bg ?? 'background.paper',
              color: tn?.fg ?? 'text.primary',
              transition: `border-color ${motion.fast}`,
            }}
          >
            <Typography
              component="span"
              sx={{ fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.1, color: 'inherit' }}
            >
              {counts[key]}
            </Typography>
            <Typography
              component="span"
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                lineHeight: 1.25,
                color: tn ? 'inherit' : 'text.secondary',
              }}
            >
              {t(`orderList.quick.${key}`)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Quick filters with counts, the Lab / Patient (and, for a clinic, Doctor)
 * menus, and the finer status and due-date controls behind "More filters".
 *
 * Below `sm` the tiles above take over "waiting on you" and "due this week",
 * so those two chips step aside rather than say the same thing twice.
 */
export function OrdersFilterBar({
  filters,
  doctorOptions,
}: {
  filters: OrderListFilterState;
  /** The clinic's doctors; leave out on the doctor's own list. */
  doctorOptions?: FilterOption[];
}) {
  const { t } = useTranslation(['common', 'doctor']);
  const mode = useTheme().palette.mode;
  const gold = tone('warning', mode);
  const { quick, setQuick, counts } = filters;

  const chip = (key: QuickFilter, extra: { phone?: boolean } = {}) => {
    const selected = quick === key;
    const golden = key === 'needsAnswer' && !selected;
    return (
      <ChoicePill
        key={key}
        selected={selected}
        count={counts[key]}
        onClick={() => setQuick(key)}
        sx={[
          extra.phone === false && { display: { xs: 'none', sm: 'inline-flex' } },
          golden && {
            borderColor: gold.border,
            bgcolor: gold.bg,
            color: gold.fg,
            '&:hover': { borderColor: gold.fg, bgcolor: gold.bg },
          },
        ]}
      >
        {key === 'needsAnswer' && <Icon name="error" size={14} />}
        {t(`orderList.quick.${key}`)}
      </ChoicePill>
    );
  };

  const menus = (
    <>
      {doctorOptions && (
        <FilterMenu
          label={t('orderList.doctorFilter')}
          value={filters.doctorId}
          options={doctorOptions}
          onChange={filters.setDoctorId}
          showAll
        />
      )}
      <FilterMenu
        label={t('orderList.labFilter')}
        value={filters.labId}
        options={filters.labOptions}
        onChange={filters.setLabId}
        showAll
      />
      <FilterMenu
        label={t('orderList.patientFilter')}
        value={filters.patientId}
        options={filters.patientOptions}
        onChange={filters.setPatientId}
      />
    </>
  );

  return (
    <Stack spacing={1.5}>
      <QuickTiles quick={quick} counts={counts} onPick={setQuick} />

      <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        {chip('all')}
        {chip('dueThisWeek', { phone: false })}
        {chip('needsAnswer', { phone: false })}
        {chip('unpaid')}
        {/* Only the phone tiles offer "ready"; keep it visible if one set it
            and the window then grew. */}
        {quick === 'ready' && chip('ready', { phone: false })}

        <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'block' } }} />

        {/* From `sm` up the menus sit in the row; a phone keeps them under
            "More filters" so the row stays one line under the tiles. */}
        <Box sx={{ display: { xs: 'none', sm: 'contents' } }}>{menus}</Box>
        <ChoicePill
          selected={filters.advancedOpen}
          onClick={() => filters.setAdvancedOpen((v) => !v)}
        >
          <Icon name="tune" size={15} />
          {t('doctor:orders.moreFilters')}
        </ChoicePill>
        {filters.hasFilters && (
          <Button size="small" onClick={filters.clear} sx={{ whiteSpace: 'nowrap' }}>
            {t('doctor:orders.filters.clear')}
          </Button>
        )}
      </Stack>

      <Collapse in={filters.advancedOpen} unmountOnExit>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          flexWrap="wrap"
          useFlexGap
          alignItems={{ sm: 'center' }}
        >
          <Stack
            direction="row"
            sx={{ display: { xs: 'flex', sm: 'none' }, flexWrap: 'wrap', gap: 0.75 }}
          >
            {menus}
          </Stack>
          <FormControl size="small" sx={{ minWidth: 190 }}>
            <InputLabel>{t('doctor:orders.filters.status')}</InputLabel>
            <Select
              multiple
              value={filters.statuses}
              onChange={(e) => filters.setStatuses(e.target.value as OrderStatus[])}
              input={<OutlinedInput label={t('doctor:orders.filters.status')} />}
              renderValue={(sel) =>
                sel.length === 0 ? '' : sel.map((s) => t(`orderStatus.${s}`)).join(', ')
              }
            >
              {ALL_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  <Checkbox checked={filters.statuses.includes(s)} size="small" />
                  <ListItemText primary={t(`orderStatus.${s}`)} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <DatePicker
            label={t('doctor:orders.filters.from')}
            value={filters.dateFrom}
            onChange={(d) => filters.setDateFrom(d)}
            format="YYYY-MM-DD"
            slotProps={{ textField: { size: 'small', sx: { width: { xs: '100%', sm: 160 } } } }}
          />
          <DatePicker
            label={t('doctor:orders.filters.to')}
            value={filters.dateTo}
            onChange={(d) => filters.setDateTo(d)}
            format="YYYY-MM-DD"
            slotProps={{ textField: { size: 'small', sx: { width: { xs: '100%', sm: 160 } } } }}
          />
        </Stack>
      </Collapse>
    </Stack>
  );
}
