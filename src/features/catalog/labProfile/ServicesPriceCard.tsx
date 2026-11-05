import { useMemo, useState } from 'react';
import { alpha, Box, Button, CircularProgress, Link, Typography, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChoicePill, EmptyState, Icon, PillRow } from '@/components/design';
import { pillOutlineSx, pillSize } from '@/features/catalog/labStyles';
import {
  serviceCategoryLabelKey,
  sortCategories,
  type ServiceCategory,
} from '@/features/catalog/serviceCategory';
import { serviceImageUrl, templateLook } from '@/utils/serviceDefaults';
import { brand, DARK, palette2026, radii, surfaces } from '@/theme/tokens';
import {
  amountText,
  panelSx,
  rushText,
  SECTION,
  sectionScrollMargin,
  turnaroundText,
  unitText,
  type TranslateFn,
} from './format';
import type { PriceDisplay } from './priceDisplay';
import type { ProfileService } from './useLabProfile';

const ALL = 'all' as const;

/** Rows before "All services": the mockup's six. A chosen category shows all of its own. */
const SERVICES_SHOWN = 6;

/** Below this panel width each service stops being a table row and stacks. */
const NARROW = '@container (max-width: 640px)';

/**
 * Sized by what they hold rather than by share, so a price is never clipped: the
 * name takes what is left, and a lab's own long turnaround label or price wording
 * wraps at its cap. The rows are subgrids, so every row's columns line up.
 */
const COLUMNS =
  '96px minmax(0, 1fr) fit-content(120px) max-content fit-content(190px) max-content';

const muted = { color: 'text.secondary', fontSize: '0.8125rem' } as const;

/** The price cell: "from 80 ₾ / tooth", the lab's own words, or why there is none. */
function PriceLine({ price, t, tc }: { price: PriceDisplay; t: TranslateFn; tc: TranslateFn }) {
  switch (price.kind) {
    case 'amount': {
      const unit = unitText(price, t);
      return (
        <Box
          component="b"
          sx={{ fontSize: '0.96875rem', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
        >
          {amountText(price, t)}
          {unit && (
            <Box component="small" sx={{ ...muted, fontSize: '0.75rem', fontWeight: 500 }}>
              {' '}
              {unit}
            </Box>
          )}
        </Box>
      );
    }
    case 'described':
      // The lab's own words, as written — clamped here, whole on hover and in
      // the order form's price panel.
      return (
        <Typography
          title={price.text}
          sx={{
            ...muted,
            lineHeight: 1.45,
            whiteSpace: 'pre-line',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {price.text}
        </Typography>
      );
    case 'noPricing':
      return <Typography sx={muted}>{tc('priceBreakdown.noPricingTitle')}</Typography>;
    case 'labConfirms':
      return <Typography sx={muted}>{t('labProfile.price.labConfirms')}</Typography>;
    default:
      // 'unavailable': the row is dimmed and says so where its button would be.
      return null;
  }
}

/**
 * The service's picture with its category across the bottom: the lab's upload,
 * else the template's stock picture. Not every template has a file behind it,
 * and a URL that 404s renders as an empty box, so it falls back to the
 * template's icon the moment the browser reports a failure.
 */
function ServicePhoto({ service, label }: { service: ProfileService; label: string }) {
  const look = templateLook(service.templateCode);
  const src = serviceImageUrl(service.imageUrl, service.templateCode);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  return (
    <Box
      role="cell"
      sx={{
        position: 'relative',
        width: 96,
        height: 68,
        borderRadius: `${radii.card}px`,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        bgcolor: alpha(look.color, 0.12),
        [NARROW]: { width: 84, height: 84, gridRow: '1 / span 3' },
      }}
    >
      {src && brokenSrc !== src ? (
        <Box
          component="img"
          src={src}
          alt=""
          loading="lazy"
          onError={() => setBrokenSrc(src)}
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <Icon name={look.icon} size={28} sx={{ color: look.color }} />
      )}
      <Box
        component="span"
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          px: '6px',
          pt: '10px',
          pb: '4px',
          background: `linear-gradient(transparent, ${alpha(palette2026.ink, 0.75)})`,
          color: 'common.white',
          fontSize: '0.65625rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </Box>
    </Box>
  );
}

function ServiceRow({
  service,
  orderHref,
}: {
  service: ProfileService;
  orderHref: (serviceId: string) => string;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const turnaround = turnaroundText(service, t);
  const rush = service.rush ? rushText(service.rush, t, tc) : null;
  // Stacked there is no column header, and a bare "3 days" beside "5 days" reads
  // as a contradiction, so this line says which is which.
  const stackedFacts = [
    turnaround && t('labProfile.turnaroundIs', { value: turnaround }),
    rush && t('labProfile.rushIs', { value: rush }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box
      role="row"
      sx={{
        position: 'relative',
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: 'subgrid',
        alignItems: 'center',
        py: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        opacity: service.orderable ? 1 : 0.65,
        [NARROW]: {
          gridTemplateColumns: '84px minmax(0, 1fr)',
          alignItems: 'start',
          columnGap: 1.5,
          rowGap: 0.5,
          py: 1.75,
        },
      }}
    >
      <ServicePhoto service={service} label={tc(serviceCategoryLabelKey(service.category))} />

      <Box role="cell" sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
          {service.name}
        </Typography>
        {service.description && (
          <Typography
            sx={{
              ...muted,
              mt: '2px',
              lineHeight: 1.45,
              overflowWrap: 'anywhere',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
            }}
          >
            {service.description}
          </Typography>
        )}
        {stackedFacts && (
          <Typography sx={{ ...muted, mt: '2px', fontSize: '0.78125rem', display: 'none', [NARROW]: { display: 'block' } }}>
            {stackedFacts}
          </Typography>
        )}
      </Box>

      <Box role="cell" sx={{ fontSize: '0.875rem', overflowWrap: 'anywhere', [NARROW]: { display: 'none' } }}>
        {turnaround ?? '—'}
      </Box>
      <Box role="cell" sx={{ ...muted, whiteSpace: 'nowrap', [NARROW]: { display: 'none' } }}>
        {rush ?? '—'}
      </Box>

      <Box role="cell" sx={{ minWidth: 0, [NARROW]: { gridColumn: 2 } }}>
        <PriceLine price={service.price} t={t} tc={tc} />
      </Box>

      <Box role="cell" sx={{ [NARROW]: { gridColumn: 2, mt: 0.75 } }}>
        {service.orderable ? (
          // A real link, so ctrl- and middle-click open the form in a new tab.
          <Button
            component={RouterLink}
            to={orderHref(service.id)}
            variant="outlined"
            aria-label={t('labProfile.orderServiceA11y', { name: service.name })}
            // No ripple: with the button unpositioned (below), the ripple layer
            // would spread over the whole row.
            disableRipple
            sx={{
              ...pillOutlineSx,
              ...pillSize.sm,
              // Static, so the ::after is placed against the row: a click anywhere
              // on a service orders it, as a real link.
              position: 'static',
              '&::after': { content: '""', position: 'absolute', inset: 0 },
              // The theme presses buttons with a scale, and a transform would make
              // the button the ::after's containing block: the link shrinks back
              // mid-click, the mouse comes up outside it, and no click fires.
              '&:active': { transform: 'none' },
              '&.Mui-focusVisible': { outline: `2px solid ${brand.main}`, outlineOffset: 2 },
            }}
          >
            {t('labProfile.orderCta')}
          </Button>
        ) : (
          <Typography sx={{ ...muted, fontSize: '0.75rem' }}>{t('labProfile.orderDisabled')}</Typography>
        )}
      </Box>
    </Box>
  );
}

/**
 * "Services & prices" as the mockup's table: picture, service, turnaround, rush,
 * price and an order button, one row each, the first six until the reader asks
 * for all. Category pills over it, when the lab has more than one category. Below
 * 640px of panel width each row stacks.
 *
 * The heading (`tabindex="-1"`) is where the order buttons up the page land.
 */
export function ServicesPriceCard({
  services,
  loading,
  orderHref,
}: {
  services: ProfileService[];
  loading: boolean;
  orderHref: (serviceId: string) => string;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const theme = useTheme();
  const mode = theme.palette.mode;
  const [category, setCategory] = useState<ServiceCategory | typeof ALL>(ALL);
  const [expanded, setExpanded] = useState(false);

  const counts = useMemo(() => {
    const m = new Map<ServiceCategory, number>();
    for (const s of services) m.set(s.category, (m.get(s.category) ?? 0) + 1);
    return m;
  }, [services]);
  const categories = sortCategories(counts.keys());
  // A filter left on a category the list no longer has (a refetch) shows all.
  const active = category !== ALL && counts.has(category) ? category : ALL;
  const matching = active === ALL ? services : services.filter((s) => s.category === active);
  const shown = active === ALL && !expanded ? matching.slice(0, SERVICES_SHOWN) : matching;

  const headLabels = [
    t('labProfile.table.photo'),
    t('labProfile.table.service'),
    t('marketplace.filters.turnaround'),
    t('marketplace.filters.rushChip'),
    t('labProfile.table.price'),
  ];

  return (
    <Box
      id={SECTION.services}
      component="section"
      sx={[
        panelSx,
        {
          containerType: 'inline-size',
          p: { xs: 2, sm: 3 },
          scrollMarginTop: sectionScrollMargin,
        },
      ]}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5 }}>
        <Typography
          tabIndex={-1}
          component="h2"
          sx={{ fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, outline: 'none' }}
        >
          {t('labProfile.servicesAndPrices')}
        </Typography>
        <Typography sx={{ ...muted, lineHeight: 1.45, flex: '1 1 260px' }}>
          {t('labProfile.pricesNote')}
        </Typography>
      </Box>

      {categories.length > 1 && (
        <PillRow sx={{ pt: 2 }}>
          <ChoicePill
            selected={active === ALL}
            onClick={() => setCategory(ALL)}
            count={services.length}
            sx={{ borderRadius: `${radii.pill}px` }}
          >
            {t('labProfile.categoryAll')}
          </ChoicePill>
          {categories.map((c) => (
            <ChoicePill
              key={c}
              selected={active === c}
              onClick={() => setCategory(c)}
              count={counts.get(c)}
              sx={{ borderRadius: `${radii.pill}px` }}
            >
              {tc(serviceCategoryLabelKey(c))}
            </ChoicePill>
          ))}
        </PillRow>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
          <CircularProgress size={28} />
        </Box>
      ) : services.length === 0 ? (
        <Box sx={{ pt: 2 }}>
          <EmptyState icon="category" title={t('labProfile.noServices')} minHeight={160} />
        </Box>
      ) : (
        <Box
          role="table"
          aria-label={t('labProfile.servicesAndPrices')}
          sx={{
            mt: 1.5,
            display: 'grid',
            gridTemplateColumns: COLUMNS,
            columnGap: '14px',
            [NARROW]: { display: 'block' },
          }}
        >
          <Box
            role="row"
            sx={{
              gridColumn: '1 / -1',
              display: 'grid',
              gridTemplateColumns: 'subgrid',
              pt: 0.75,
              pb: 1.25,
              borderBottom: 1,
              borderColor: 'divider',
              [NARROW]: { display: 'none' },
            }}
          >
            {headLabels.map((label) => (
              <Box
                key={label}
                role="columnheader"
                sx={{
                  fontSize: '0.71875rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: surfaces[mode].textMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </Box>
            ))}
            <span />
          </Box>
          {shown.map((s) => (
            <ServiceRow key={s.id} service={s} orderHref={orderHref} />
          ))}
        </Box>
      )}

      {shown.length < services.length && (
        <Box sx={{ pt: 1.75 }}>
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={() => {
              setCategory(ALL);
              setExpanded(true);
            }}
            sx={{
              fontSize: '0.875rem',
              fontWeight: 700,
              color: mode === 'light' ? palette2026.periText : DARK.periLight,
            }}
          >
            {t('labProfile.showAll', { n: services.length })}
          </Link>
        </Box>
      )}
    </Box>
  );
}
