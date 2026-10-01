import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Drawer,
  IconButton,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ActingDoctorChip } from '@/features/clinic/ActingDoctorChip';
import { catalogPaths } from '@/features/public/publicRoutes';
import { LabCard } from '@/components/LabCard';
import { useLabText } from '@/features/lab/labText';
import { EmptyState, Icon, PageHeader } from '@/components/design';
import { layout, radii } from '@/theme/tokens';
import {
  activeFilterCount,
  buildMaterials,
  facetCounts,
  hasServiceFilters,
  labMatches,
  orderHref,
  rankLabs,
  serviceMatches,
  type CatalogueFilters,
  type CatalogueLab,
  type CatalogueService,
} from '@/features/catalog/catalogue';
import { useCatalogueLabs } from '@/features/catalog/useCatalogueLabs';
import { catalogueQuery, useCatalogueFilters } from '@/features/catalog/useCatalogueFilters';
import { CatalogueFilterPanel, PanelLink } from '@/features/catalog/CatalogueFilterPanel';
import { ActiveFilterChips } from '@/features/catalog/ActiveFilterChips';
import { warmGuestWizard } from '@/features/catalog/warmGuestWizard';

/** Where the pinned filter column sits: just under the page header band. */
const SIDEBAR_TOP = layout.railTop + 8;
/** Air kept below a pinned column. */
const SIDEBAR_GUTTER = 24;

/**
 * Pins the filter column only while it fits in the window — the same rule as
 * `SplitLayout`'s rail: a sticky element taller than the screen hides its
 * own bottom, and a scroll inside the page's scroll reads as missing rows.
 */
function useFitsWindow() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [fits, setFits] = useState(true);
  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setFits(el.scrollHeight <= window.innerHeight - SIDEBAR_TOP - SIDEBAR_GUTTER);
  }, []);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);
  return { ref, fits };
}

function LabCardSkeleton() {
  return (
    <Card sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={2.5}>
        <Skeleton variant="rounded" width={72} height={72} sx={{ borderRadius: '14px', flexShrink: 0 }} />
        <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
          <Skeleton width="45%" height={26} />
          <Skeleton width="65%" />
          <Stack direction="row" spacing={0.75}>
            <Skeleton variant="rounded" width={140} height={26} />
            <Skeleton variant="rounded" width={120} height={26} />
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}

/**
 * The lab catalogue. Identical for a doctor, for a clinic admin ordering on a
 * doctor's behalf, and for a guest with no account — the difference is where
 * the links go, and that the clinic carries the acting doctor along in
 * `?doctor=`. Nothing here needs a session: the query runs under policies
 * that admit `anon` (see `CATALOGUE_SELECT`).
 *
 * Filters (search, service type, material, city, turnaround, rush) sit in a
 * column from `md` up and in a bottom sheet below it; they live in the URL
 * (`useCatalogueFilters`). Labs are ranked by how many prices they publish.
 */
export function MarketplacePage({
  basePath = '/doctor',
  guest = false,
}: {
  basePath?: string;
  guest?: boolean;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { labText, lang } = useLabText();
  const [params] = useSearchParams();
  const doctorParam = params.get('doctor') ?? '';
  const isClinic = !guest && basePath === '/clinic';
  const paths = catalogPaths(guest, basePath);
  const { filters, update, clear } = useCatalogueFilters();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sidebar = useFitsWindow();

  const { data: labs = [], isLoading, error } = useCatalogueLabs();
  const loaded = !isLoading && !error;

  const materials = useMemo(() => buildMaterials(labs), [labs]);
  const materialLabels = useMemo(
    () => new Map(materials.map((m) => [m.key, m.label])),
    [materials],
  );

  // A shared or stale link can name a material or city no lab lists any
  // more; filtering by it would hide every lab behind a chip the panel cannot
  // show. Once the data is in, such values are ignored.
  const effective = useMemo<CatalogueFilters>(() => {
    if (!loaded) return filters;
    const cities = new Set(labs.map((l) => l.city).filter(Boolean));
    return {
      ...filters,
      materials: filters.materials.filter((k) => materialLabels.has(k)),
      city: filters.city && cities.has(filters.city) ? filters.city : null,
    };
  }, [filters, labs, loaded, materialLabels]);

  const facets = useMemo(
    () => facetCounts(labs, materials, effective),
    [labs, materials, effective],
  );
  const ranked = useMemo(
    () => rankLabs(labs, (l: CatalogueLab) => labText(l, 'public_name'), lang),
    [labs, labText, lang],
  );
  const results = useMemo(
    () => ranked.filter((l) => labMatches(l, effective)),
    [ranked, effective],
  );
  const activeCount = activeFilterCount(effective);
  const highlight = hasServiceFilters(effective)
    ? (s: CatalogueService) => serviceMatches(s, effective)
    : undefined;

  // The lab's page carries the clinic's doctor and the filters, so its
  // breadcrumb returns to this same list.
  const labQuery = catalogueQuery(params);

  const panelProps = { filters: effective, update, clear, facets };

  return (
    <>
      <PageHeader
        // The doctor reaches the catalogue from the top bar, so there is
        // nowhere to go back to; the clinic reaches it mid-flow, one step after
        // choosing the doctor, and needs the way back to that choice.
        backTo={isClinic ? `${basePath}/orders/new` : undefined}
        title={
          <>
            {t('marketplace.heading')}
            {loaded && (
              <Box
                component="span"
                sx={{ ml: 0.75, fontWeight: 500, color: 'text.secondary', fontSize: '0.85em' }}
              >
                · {results.length}
              </Box>
            )}
          </>
        }
        subtitle={t('marketplace.headingSub')}
        chips={
          isClinic && doctorParam ? (
            <ActingDoctorChip doctorId={doctorParam} changeTo={`${basePath}/orders/new`} />
          ) : undefined
        }
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: '264px minmax(0, 1fr)',
            lg: '296px minmax(0, 1fr)',
          },
          gap: { md: 2.5, lg: 3 },
          alignItems: 'start',
        }}
      >
        <Box
          component="aside"
          ref={sidebar.ref}
          aria-label={t('marketplace.filters.title')}
          sx={{
            display: { xs: 'none', md: 'block' },
            position: sidebar.fits ? 'sticky' : 'static',
            top: `${SIDEBAR_TOP}px`,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: `${radii.card}px`,
            px: 2.25,
            pt: 2.25,
            pb: 1,
          }}
        >
          <CatalogueFilterPanel {...panelProps} />
        </Box>

        {/* Flex gap, not margins: the hidden phone toolbar and an empty chip row
            must not leave spacing above the first card. */}
        <Stack spacing={1.75} useFlexGap sx={{ minWidth: 0 }}>
          {/* Below `md` the column is a sheet; search and its button stay here. */}
          <Stack direction="row" spacing={1} sx={{ display: { md: 'none' } }}>
            <TextField
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
              placeholder={t('marketplace.filters.searchPlaceholder')}
              size="small"
              sx={{ flex: 1, minWidth: 0 }}
              inputProps={{ 'aria-label': t('marketplace.search') }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Icon name="search" size={18} sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="outlined"
              onClick={() => setSheetOpen(true)}
              startIcon={<Icon name="tune" size={18} />}
              aria-haspopup="dialog"
              sx={{ flexShrink: 0, py: 0.75 }}
            >
              {t('marketplace.filters.title')}
              {activeCount > 0 && (
                <Box component="span" sx={{ ml: 0.75, color: 'text.secondary' }}>
                  · {activeCount}
                </Box>
              )}
            </Button>
          </Stack>

          <ActiveFilterChips
            filters={effective}
            update={update}
            clear={clear}
            materialLabel={(k) => materialLabels.get(k) ?? null}
          />

          {error && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

          {isLoading ? (
            <>
              <LabCardSkeleton />
              <LabCardSkeleton />
            </>
          ) : error ? null : labs.length === 0 ? (
            <EmptyState icon="store" title={t('marketplace.empty')} />
          ) : results.length === 0 ? (
            <EmptyState
              icon="filter_alt_off"
              title={t('marketplace.noMatches')}
              description={t('marketplace.noMatchesHint')}
              action={
                <Button variant="outlined" size="small" onClick={clear}>
                  {t('marketplace.filters.clear', { n: activeCount })}
                </Button>
              }
            />
          ) : (
            <Stack component="section" spacing={1.75} aria-label={t('marketplace.heading')}>
              {results.map((lab) => (
                <LabCard
                  key={lab.id}
                  lab={lab}
                  profileTo={`${paths.lab(lab.id)}${labQuery}`}
                  orderHrefFor={(serviceId) =>
                    orderHref(paths.orderNew, lab.id, serviceId, doctorParam || null)
                  }
                  onOrderIntent={guest ? warmGuestWizard : undefined}
                  isHighlighted={highlight}
                  materials={effective.materials}
                />
              ))}
            </Stack>
          )}

          {loaded && results.length > 1 && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 0.5, color: 'text.secondary' }}>
              <Icon name="info" size={15} />
              <Typography sx={{ fontSize: '0.75rem' }}>{t('marketplace.ranking')}</Typography>
            </Stack>
          )}
        </Stack>
      </Box>

      <Drawer
        anchor="bottom"
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        PaperProps={{
          role: 'dialog',
          'aria-label': t('marketplace.filters.title'),
          sx: {
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ px: 2, pt: 1.75, pb: 1.25, borderBottom: 1, borderColor: 'divider' }}
        >
          <Typography component="h2" sx={{ fontSize: '0.9375rem', fontWeight: 600, flex: 1 }}>
            {t('marketplace.filters.title')}
          </Typography>
          {activeCount > 0 && (
            <PanelLink onClick={clear}>{t('marketplace.filters.clear', { n: activeCount })}</PanelLink>
          )}
          <IconButton onClick={() => setSheetOpen(false)} aria-label={tc('actions.close')} size="small">
            <Icon name="close" size={20} />
          </IconButton>
        </Stack>
        <Box sx={{ px: 2, overflowY: 'auto', flex: 1 }}>
          {/* The sheet's own header replaces the panel's; its first group's
              hairline would double the header's, so it is hidden. */}
          <Box sx={{ '& > div > section:first-of-type': { borderTop: 0 } }}>
            <CatalogueFilterPanel {...panelProps} showSearch={false} showHeader={false} />
          </Box>
        </Box>
        <Box
          sx={{
            px: 2,
            pt: 1.25,
            pb: 'calc(12px + env(safe-area-inset-bottom, 0px))',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Button variant="contained" fullWidth onClick={() => setSheetOpen(false)}>
            {t('marketplace.filters.show', { n: results.length })}
          </Button>
        </Box>
      </Drawer>
    </>
  );
}
