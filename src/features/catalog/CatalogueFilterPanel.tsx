import { useState, type ReactNode } from 'react';
import {
  Box,
  ButtonBase,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ChoicePill, Icon } from '@/components/design';
import { brand, motion, palette2026, surfaces } from '@/theme/tokens';
import { serviceCategoryLabelKey, type ServiceCategory } from './serviceCategory';
import {
  TURNAROUND_BUCKETS,
  activeFilterCount,
  type CatalogueFilters,
  type FacetCounts,
} from './catalogue';
import type { FilterUpdate } from './useCatalogueFilters';

/** Materials shown before "all materials · N". */
const MATERIALS_SHOWN = 8;

const ALL = '__all__';

/** Periwinkle small text at AA contrast — links in the panel. */
function useLinkColor() {
  const theme = useTheme();
  return theme.palette.mode === 'light' ? palette2026.periText : brand.soft;
}

/** A text link that is a button: "clear · 3", "all materials · 19". */
export function PanelLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  const color = useLinkColor();
  return (
    <ButtonBase
      onClick={onClick}
      disableRipple
      sx={{
        alignSelf: 'flex-start',
        fontFamily: 'inherit',
        fontSize: '0.75rem',
        fontWeight: 600,
        color,
        borderRadius: '4px',
        '&:hover': { textDecoration: 'underline' },
        '&:focus-visible': { outline: `2px solid ${brand.main}`, outlineOffset: 2 },
      }}
    >
      {children}
    </ButtonBase>
  );
}

function Group({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <Stack
      component="section"
      spacing={0.875}
      sx={{ py: 1.5, borderTop: 1, borderColor: 'divider' }}
    >
      {title && (
        <Typography component="h3" sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>
          {title}
        </Typography>
      )}
      {children}
    </Stack>
  );
}

/**
 * The design's small square checkbox: a real (visually hidden) input for
 * keyboard and screen readers, drawn as a 16px box — ink with a tick when on,
 * a dashed-grey edge when off.
 */
function FilterCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  const theme = useTheme();
  const s = surfaces[theme.palette.mode];
  return (
    <Box component="span" sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <Box
        component="input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        sx={{
          position: 'absolute',
          inset: 0,
          m: 0,
          opacity: 0,
          cursor: 'inherit',
          '&:focus-visible + span': { outline: `2px solid ${brand.main}`, outlineOffset: 2 },
        }}
      />
      <Box
        component="span"
        aria-hidden
        sx={{
          width: 16,
          height: 16,
          borderRadius: '5px',
          border: '1.5px solid',
          borderColor: checked ? 'primary.main' : s.dashed,
          bgcolor: checked ? 'primary.main' : 'background.paper',
          color: 'primary.contrastText',
          display: 'grid',
          placeItems: 'center',
          opacity: disabled ? 0.5 : 1,
          transition: `background-color ${motion.fast}, border-color ${motion.fast}`,
        }}
      >
        {checked && <Icon name="check" size={13} />}
      </Box>
    </Box>
  );
}

/**
 * The design's joined segmented control: hairline-bordered segments, the
 * chosen one in ink.
 */
function Segments<T extends string | number | null>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const theme = useTheme();
  const control = surfaces[theme.palette.mode].control;
  return (
    <Box
      role="group"
      aria-label={label}
      sx={{
        display: 'flex',
        width: '100%',
        border: 1,
        borderColor: control,
        borderRadius: '8px',
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <ButtonBase
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            sx={{
              flex: 1,
              minWidth: 0,
              height: 32,
              px: 0.5,
              fontFamily: 'inherit',
              fontSize: '0.75rem',
              fontWeight: on ? 600 : 500,
              whiteSpace: 'nowrap',
              borderLeft: i === 0 ? 0 : 1,
              borderColor: control,
              bgcolor: on ? 'primary.main' : 'transparent',
              color: on ? 'primary.contrastText' : 'text.primary',
              transition: `background-color ${motion.fast}`,
              '&:hover': { bgcolor: on ? 'primary.main' : 'action.hover' },
              '&.Mui-focusVisible': { outline: `2px solid ${brand.main}`, outlineOffset: -2 },
            }}
          >
            {o.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

/**
 * The catalogue's filters: search, service type, material, city, turnaround
 * and rush. The same panel is the sticky sidebar from `md` up and the body of
 * the bottom sheet below it.
 */
export function CatalogueFilterPanel({
  filters,
  update,
  clear,
  facets,
  showSearch = true,
  showHeader = true,
}: {
  filters: CatalogueFilters;
  update: (change: FilterUpdate) => void;
  clear: () => void;
  facets: FacetCounts;
  showSearch?: boolean;
  showHeader?: boolean;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const theme = useTheme();
  const s = surfaces[theme.palette.mode];
  const [allMaterials, setAllMaterials] = useState(false);
  const active = activeFilterCount(filters);

  // The top materials, plus any picked one that would otherwise be hidden.
  const materials =
    allMaterials || facets.materials.length <= MATERIALS_SHOWN
      ? facets.materials
      : facets.materials.filter(
          (m, i) => i < MATERIALS_SHOWN || filters.materials.includes(m.key),
        );

  const flip = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const toggleCategory = (key: ServiceCategory) =>
    update((f) => ({ categories: flip(f.categories, key) }));
  const toggleMaterial = (key: string) => update((f) => ({ materials: flip(f.materials, key) }));

  return (
    <Stack>
      {showHeader && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ pb: 1.5 }}>
          <Typography component="h2" sx={{ fontSize: '0.9375rem', fontWeight: 600 }}>
            {t('marketplace.filters.title')}
          </Typography>
          {active > 0 && (
            <PanelLink onClick={clear}>{t('marketplace.filters.clear', { n: active })}</PanelLink>
          )}
        </Stack>
      )}

      {showSearch && (
        <Box sx={{ pb: 1.5 }}>
          <TextField
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder={t('marketplace.filters.searchPlaceholder')}
            size="small"
            fullWidth
            inputProps={{ 'aria-label': t('marketplace.search') }}
            sx={{ '& .MuiOutlinedInput-root': { bgcolor: s.subtle } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Icon name="search" size={17} sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>
      )}

      {facets.categories.length > 0 && (
        <Group title={t('marketplace.filters.serviceType')}>
          <Stack spacing={0.25}>
            {facets.categories.map(({ key, count }) => {
              const checked = filters.categories.includes(key);
              const dead = count === 0 && !checked;
              return (
                <Box
                  key={key}
                  component="label"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minHeight: 30,
                    fontSize: '0.8125rem',
                    cursor: dead ? 'default' : 'pointer',
                    color: dead ? 'text.secondary' : 'text.primary',
                  }}
                >
                  <FilterCheckbox
                    checked={checked}
                    disabled={dead}
                    onChange={() => toggleCategory(key)}
                  />
                  <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                    {tc(serviceCategoryLabelKey(key))}
                  </Box>
                  <Box
                    component="span"
                    sx={{ fontSize: '0.75rem', color: s.textMuted, fontFeatureSettings: '"tnum"' }}
                  >
                    {count}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Group>
      )}

      {facets.materials.length > 0 && (
        <Group title={t('marketplace.filters.material')}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            {materials.map((m) => {
              const selected = filters.materials.includes(m.key);
              return (
                <ChoicePill
                  key={m.key}
                  selected={selected}
                  disabled={m.count === 0 && !selected}
                  onClick={() => toggleMaterial(m.key)}
                  count={m.count}
                  sx={{ px: 1.25, py: 0.625, fontSize: '0.75rem', fontWeight: 500, borderRadius: '8px' }}
                >
                  {m.label}
                </ChoicePill>
              );
            })}
          </Stack>
          {facets.materials.length > MATERIALS_SHOWN && (
            <PanelLink onClick={() => setAllMaterials((v) => !v)}>
              {allMaterials
                ? t('marketplace.filters.fewerMaterials')
                : t('marketplace.filters.allMaterials', { n: facets.materials.length })}
            </PanelLink>
          )}
        </Group>
      )}

      {facets.cities.length > 1 && (
        <Group title={t('marketplace.filters.city')}>
          <TextField
            select
            size="small"
            fullWidth
            value={filters.city ?? ALL}
            onChange={(e) => update({ city: e.target.value === ALL ? null : e.target.value })}
            inputProps={{ 'aria-label': t('marketplace.filters.city') }}
          >
            <MenuItem value={ALL}>{t('marketplace.allCities')}</MenuItem>
            {facets.cities.map((c) => (
              <MenuItem key={c.name} value={c.name}>
                {c.name}
                <Box component="span" sx={{ color: 'text.secondary', ml: 0.75 }}>
                  · {c.count}
                </Box>
              </MenuItem>
            ))}
          </TextField>
        </Group>
      )}

      <Group title={t('marketplace.filters.turnaround')}>
        <Segments
          label={t('marketplace.filters.turnaround')}
          value={filters.maxDays}
          onChange={(maxDays) => update({ maxDays })}
          options={[
            ...TURNAROUND_BUCKETS.map((days) => ({
              value: days as number | null,
              label: t('marketplace.filters.maxDays', { days }),
            })),
            { value: null, label: t('marketplace.filters.anyTime') },
          ]}
        />
      </Group>

      {facets.rushOffered && (
        <Group title={t('marketplace.filters.rushChip')}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            <ChoicePill
              selected={filters.rush}
              disabled={facets.rush === 0 && !filters.rush}
              onClick={() => update({ rush: !filters.rush })}
              count={facets.rush}
              sx={{ px: 1.25, py: 0.625, fontSize: '0.75rem', fontWeight: 500, borderRadius: '8px' }}
            >
              <Icon name="bolt" size={15} />
              {t('marketplace.filters.rush')}
            </ChoicePill>
          </Stack>
        </Group>
      )}
    </Stack>
  );
}
