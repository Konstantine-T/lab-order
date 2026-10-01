import { Box, ButtonBase, Stack, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { brand, motion, surfaces } from '@/theme/tokens';
import { serviceCategoryLabelKey } from './serviceCategory';
import { activeFilterCount, type CatalogueFilters } from './catalogue';
import type { FilterUpdate } from './useCatalogueFilters';
import { PanelLink } from './CatalogueFilterPanel';

/**
 * The active filters as removable chips above the results, closed by a
 * "clear · N" link — on a phone, where the panel is a sheet, this row is the
 * only place the filters stay visible.
 */
export function ActiveFilterChips({
  filters,
  update,
  clear,
  materialLabel,
}: {
  filters: CatalogueFilters;
  update: (change: FilterUpdate) => void;
  clear: () => void;
  /** The merged label for a material key; null when the key is unknown. */
  materialLabel: (key: string) => string | null;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const theme = useTheme();
  const s = surfaces[theme.palette.mode];
  const count = activeFilterCount(filters);
  if (count === 0) return null;

  const chips: { key: string; label: string; remove: FilterUpdate }[] = [];
  const query = filters.search.trim();
  if (query) {
    chips.push({ key: 'q', label: t('marketplace.filters.searchChip', { query }), remove: { search: '' } });
  }
  filters.categories.forEach((c) =>
    chips.push({
      key: `type:${c}`,
      label: tc(serviceCategoryLabelKey(c)),
      remove: (f) => ({ categories: f.categories.filter((x) => x !== c) }),
    }),
  );
  filters.materials.forEach((m) =>
    chips.push({
      key: `mat:${m}`,
      label: materialLabel(m) ?? m,
      remove: (f) => ({ materials: f.materials.filter((x) => x !== m) }),
    }),
  );
  if (filters.city) chips.push({ key: 'city', label: filters.city, remove: { city: null } });
  if (filters.maxDays) {
    chips.push({
      key: 'days',
      label: t('marketplace.filters.maxDays', { days: filters.maxDays }),
      remove: { maxDays: null },
    });
  }
  if (filters.rush) {
    chips.push({ key: 'rush', label: t('marketplace.filters.rushChip'), remove: { rush: false } });
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      component="ul"
      aria-label={t('marketplace.filters.active')}
      sx={{ flexWrap: 'wrap', gap: 0.75, m: 0, p: 0, listStyle: 'none' }}
    >
      {chips.map((c) => (
        <Box component="li" key={c.key} sx={{ maxWidth: '100%' }}>
          <ButtonBase
            onClick={() => update(c.remove)}
            aria-label={t('marketplace.filters.remove', { label: c.label })}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              maxWidth: '100%',
              minHeight: 30,
              pl: 1.25,
              pr: 0.75,
              borderRadius: '8px',
              border: 1,
              borderColor: s.control,
              bgcolor: 'background.paper',
              fontFamily: 'inherit',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'text.primary',
              textAlign: 'left',
              transition: `border-color ${motion.fast}`,
              '&:hover': { borderColor: brand.main },
              '&.Mui-focusVisible': { outline: `2px solid ${brand.main}`, outlineOffset: 2 },
            }}
          >
            <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {c.label}
            </Box>
            <Box
              component="span"
              aria-hidden
              sx={{
                width: 18,
                height: 18,
                flexShrink: 0,
                borderRadius: '5px',
                display: 'grid',
                placeItems: 'center',
                bgcolor: s.chip,
                color: 'text.secondary',
              }}
            >
              <Icon name="close" size={13} />
            </Box>
          </ButtonBase>
        </Box>
      ))}
      <Box component="li" sx={{ display: 'flex', alignItems: 'center', px: 0.5 }}>
        <PanelLink onClick={clear}>{t('marketplace.filters.clear', { n: count })}</PanelLink>
      </Box>
    </Stack>
  );
}
