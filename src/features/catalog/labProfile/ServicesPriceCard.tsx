import { forwardRef, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChoicePill, EmptyState, PillRow } from '@/components/design';
import { formatGELShort } from '@/utils/pricing';
import {
  serviceCategoryLabelKey,
  sortCategories,
  type ServiceCategory,
} from '@/features/catalog/serviceCategory';
import { brand, palette2026 } from '@/theme/tokens';
import { panelSx, rushText, turnaroundText, type TranslateFn } from './format';
import type { PriceDisplay } from './priceDisplay';
import type { ProfileService } from './useLabProfile';

const ALL = 'all' as const;

/** Desktop columns: service · turnaround · rush · price · action. */
const COLUMNS = 'minmax(0, 1fr) 96px 130px 150px 112px';

const muted = { color: 'text.secondary', fontSize: '0.8125rem' } as const;

/** Read aloud, never seen: the desktop cells' column names. */
const srOnly = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

function PriceCell({ price, t, tc }: { price: PriceDisplay; t: TranslateFn; tc: TranslateFn }) {
  switch (price.kind) {
    case 'amount': {
      const amount = formatGELShort(price.amount);
      return (
        <Box component="span" sx={{ fontSize: '0.875rem' }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            {price.from ? t('marketplace.fromPrice', { price: amount }) : amount}
          </Box>
          {price.per !== 'order' && (
            <Box component="span" sx={{ ...muted, fontSize: '0.75rem', fontWeight: 500 }}>
              {' '}
              {t(`marketplace.per.${price.per}`)}
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
            fontSize: '0.75rem',
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
      return <Typography sx={muted}>—</Typography>;
  }
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

  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        display: 'grid',
        alignItems: 'center',
        columnGap: 2,
        rowGap: 1,
        py: 2,
        borderTop: 1,
        borderColor: 'divider',
        gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', md: COLUMNS },
        gridTemplateAreas: {
          xs: '"name name" "facts facts" "price action"',
          md: '"name turn rush price action"',
        },
      }}
    >
      <Stack spacing={0.375} sx={{ gridArea: 'name', minWidth: 0 }}>
        <Typography
          component="h3"
          sx={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.4, overflowWrap: 'anywhere' }}
        >
          {service.name}
        </Typography>
        {service.description && (
          <Typography
            sx={{
              ...muted,
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
              overflow: 'hidden',
              overflowWrap: 'anywhere',
            }}
          >
            {service.description}
          </Typography>
        )}
      </Stack>

      {/* Phone: turnaround and rush on one labelled line under the name. */}
      {(turnaround || rush) && (
        <Stack
          direction="row"
          sx={{
            gridArea: 'facts',
            display: { xs: 'flex', md: 'none' },
            flexWrap: 'wrap',
            columnGap: 1.75,
            rowGap: 0.25,
            ...muted,
          }}
        >
          {turnaround && <span>{t('labProfile.turnaroundIs', { value: turnaround })}</span>}
          {rush && <span>{t('labProfile.rushIs', { value: rush })}</span>}
        </Stack>
      )}

      {/* Desktop: one cell each under the (aria-hidden) column labels, so
          each says what it is to a screen reader — both are day counts. */}
      <Typography sx={{ gridArea: 'turn', display: { xs: 'none', md: 'block' }, fontSize: '0.875rem' }}>
        <Box component="span" sx={srOnly}>
          {t('labProfile.table.turnaround')}{' '}
        </Box>
        {turnaround ?? '—'}
      </Typography>
      <Typography sx={{ gridArea: 'rush', display: { xs: 'none', md: 'block' }, ...muted }}>
        <Box component="span" sx={srOnly}>
          {t('labProfile.table.rush')}{' '}
        </Box>
        {rush ?? '—'}
      </Typography>

      <Box sx={{ gridArea: 'price', minWidth: 0 }}>
        <PriceCell price={service.price} t={t} tc={tc} />
      </Box>

      <Box sx={{ gridArea: 'action', justifySelf: { xs: 'end', md: 'stretch' } }}>
        {service.orderable ? (
          <Button
            component={RouterLink}
            to={orderHref(service.id)}
            variant="outlined"
            size="small"
            fullWidth
            aria-label={t('labProfile.orderServiceA11y', { name: service.name })}
            sx={{ minWidth: 96 }}
          >
            {t('labProfile.orderCta')}
          </Button>
        ) : (
          <Typography sx={{ ...muted, fontSize: '0.75rem', textAlign: { xs: 'right', md: 'left' } }}>
            {t('labProfile.orderDisabled')}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/**
 * "Services & prices" (design page 4): category chips over a table of the
 * lab's active services — name and description, turnaround, rush, price with
 * its unit, and an order button per orderable service. One column on phones.
 *
 * The ref lands on the card's heading, which the rail's order button scrolls
 * to and focuses.
 */
export const ServicesPriceCard = forwardRef<
  HTMLHeadingElement,
  {
    services: ProfileService[];
    loading: boolean;
    orderHref: (serviceId: string) => string;
  }
>(function ServicesPriceCard({ services, loading, orderHref }, headingRef) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const [category, setCategory] = useState<ServiceCategory | typeof ALL>(ALL);

  const counts = useMemo(() => {
    const m = new Map<ServiceCategory, number>();
    for (const s of services) m.set(s.category, (m.get(s.category) ?? 0) + 1);
    return m;
  }, [services]);
  const categories = sortCategories(counts.keys());
  // A filter left on a category the list no longer has (a refetch) shows all.
  const active = category !== ALL && counts.has(category) ? category : ALL;
  const shown = active === ALL ? services : services.filter((s) => s.category === active);

  return (
    <Box
      id="lab-services"
      sx={[panelSx, { px: { xs: 2.25, sm: 3.5 }, pt: 2.75, pb: 1, scrollMarginTop: 88 }]}
    >
      <Stack direction="row" alignItems="baseline" spacing={1}>
        <Typography
          ref={headingRef}
          tabIndex={-1}
          component="h2"
          sx={{ fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3, outline: 'none' }}
        >
          {t('labProfile.servicesAndPrices')}
        </Typography>
        {services.length > 0 && (
          <Typography sx={{ ...muted, fontSize: '0.875rem', fontWeight: 500 }}>
            {services.length}
          </Typography>
        )}
      </Stack>

      {categories.length > 1 && (
        <PillRow sx={{ pt: 1.75, pb: 0.5 }}>
          <ChoicePill selected={active === ALL} onClick={() => setCategory(ALL)}>
            {t('labProfile.categoryAll')}
          </ChoicePill>
          {categories.map((c) => (
            <ChoicePill
              key={c}
              selected={active === c}
              onClick={() => setCategory(c)}
              count={counts.get(c)}
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
        <Box sx={{ pt: 2, pb: 1.5 }}>
          <EmptyState icon="category" title={t('labProfile.noServices')} minHeight={160} />
        </Box>
      ) : (
        <>
          {/* Column labels — desktop only; on a phone each row labels itself. */}
          <Box
            aria-hidden
            sx={{
              display: { xs: 'none', md: 'grid' },
              gridTemplateColumns: COLUMNS,
              columnGap: 2,
              pt: 1.75,
              pb: 1,
              '& > span': { fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' },
            }}
          >
            <span>{t('labProfile.table.service')}</span>
            <span>{t('labProfile.table.turnaround')}</span>
            <span>{t('labProfile.table.rush')}</span>
            <span>{t('labProfile.table.price')}</span>
            <span />
          </Box>
          <Box component="ul" sx={{ m: 0, p: 0, mt: { xs: 1.5, md: 0 } }}>
            {shown.map((s) => (
              <ServiceRow key={s.id} service={s} orderHref={orderHref} />
            ))}
          </Box>
        </>
      )}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        sx={{ gap: 1, pt: 1.75, pb: 1.5, borderTop: 1, borderColor: 'divider' }}
      >
        <Typography sx={{ ...muted, fontSize: '0.75rem', lineHeight: 1.5 }}>
          {t('labProfile.pricesNote')}
        </Typography>
        {active !== ALL && (
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={() => setCategory(ALL)}
            sx={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: (theme) =>
                theme.palette.mode === 'light' ? palette2026.periText : brand.soft,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {t('labProfile.showAll', { n: services.length })}
          </Link>
        )}
      </Stack>
    </Box>
  );
});
