import { useMemo } from 'react';
import { Autocomplete, Box, TextField, Typography, createFilterOptions } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { QueueFilterOption } from './queueFilters';

// Type-to-narrow matches the secondary line too, so a destination can be found
// by its city as well as its clinic name.
const filterOptions = createFilterOptions<QueueFilterOption>({
  stringify: (o) => `${o.label} ${o.detail ?? ''}`,
});

/**
 * A single-select, type-to-narrow filter for the lab queue's "More filters"
 * row. Autocomplete rather than Select: a lab two years in may have a hundred
 * doctors, and a hundred-item dropdown is unusable — at five it still reads as
 * a plain control. Empty means "every doctor" / "every destination".
 */
export function QueueFilterAutocomplete({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  /** Shown while the field is focused and empty — the "no filter" meaning. */
  placeholder: string;
  options: QueueFilterOption[];
  /** The selected option's `key`, or null for no filter. */
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const selected = useMemo(
    () => (value ? (options.find((o) => o.key === value) ?? null) : null),
    [options, value],
  );

  return (
    <Autocomplete
      size="small"
      options={options}
      value={selected}
      onChange={(_, o) => onChange(o?.key ?? null)}
      filterOptions={filterOptions}
      getOptionLabel={(o) => o.label}
      // Two doctors can share a name; the key must not.
      getOptionKey={(o) => o.key}
      isOptionEqualToValue={(a, b) => a.key === b.key}
      disabled={options.length === 0}
      noOptionsText={t('ordersDashboard.filters.noMatches')}
      clearText={t('ordersDashboard.filters.clearField')}
      openText={t('ordersDashboard.filters.openList')}
      closeText={tc('actions.close')}
      // The field stays in line with the 190px status control; the list may be
      // wider so a long Georgian clinic name wraps less.
      sx={{ width: { xs: '100%', sm: 220 } }}
      slotProps={{ popper: { sx: { minWidth: 280 } } }}
      renderOption={(props, o) => {
        const { key, ...rest } = props;
        return (
          <li key={key} {...rest}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {o.label}
              </Typography>
              {o.detail && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', overflowWrap: 'anywhere' }}
                >
                  {o.detail}
                </Typography>
              )}
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: 1.5, flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              {t('ordersDashboard.filters.orderCount', { count: o.count })}
            </Typography>
          </li>
        );
      }}
      renderInput={(params) => <TextField {...params} label={label} placeholder={placeholder} />}
    />
  );
}
