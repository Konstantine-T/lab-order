import { forwardRef, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CardGrid, ChoicePill, EmptyState, Icon, MetaChip, PillRow } from '@/components/design';
import { ServiceCard } from '@/components/ServiceCard';
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

const muted = { color: 'text.secondary', fontSize: '0.8125rem' } as const;

/** The card's price: "from 80 ₾ / tooth", the lab's own words, or why there is none. */
function PriceLine({ price, t, tc }: { price: PriceDisplay; t: TranslateFn; tc: TranslateFn }) {
  switch (price.kind) {
    case 'amount': {
      const amount = formatGELShort(price.amount);
      return (
        <Box component="span" sx={{ fontSize: '0.9375rem' }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            {price.from ? t('marketplace.fromPrice', { price: amount }) : amount}
          </Box>
          {price.per !== 'order' && (
            <Box component="span" sx={{ ...muted, fontWeight: 500 }}>
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
      // 'unavailable': the card is dimmed and says so in its footer already.
      return null;
  }
}

function ProfileServiceCard({
  service,
  orderHref,
}: {
  service: ProfileService;
  orderHref: (serviceId: string) => string;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const turnaround = turnaroundText(service, t);
  const href = orderHref(service.id);

  return (
    <ServiceCard
      templateCode={service.templateCode}
      imageUrl={service.imageUrl}
      name={service.name}
      description={service.description ?? undefined}
      chips={
        turnaround && <MetaChip icon={<Icon name="schedule" size={13} />}>{turnaround}</MetaChip>
      }
      // Labelled, as the lab's own card labels it: with no column header
      // above it, a bare "3 days" beside the turnaround's "5 days" reads as
      // a contradiction.
      rush={
        service.rush && (
          <MetaChip icon={<Icon name="bolt" size={13} />}>
            {t('labProfile.rushIs', { value: rushText(service.rush, t, tc) })}
          </MetaChip>
        )
      }
      price={
        service.price.kind !== 'unavailable' && <PriceLine price={service.price} t={t} tc={tc} />
      }
      disabled={!service.orderable}
      onClick={service.orderable ? () => navigate(href) : undefined}
      action={
        service.orderable ? (
          // A real link, so ctrl- and middle-click open the form in a new tab.
          <Button
            component={RouterLink}
            to={href}
            variant="contained"
            size="small"
            aria-label={t('labProfile.orderServiceA11y', { name: service.name })}
          >
            {t('labProfile.orderCta')}
          </Button>
        ) : (
          <Typography sx={{ ...muted, fontSize: '0.75rem' }}>
            {t('labProfile.orderDisabled')}
          </Typography>
        )
      }
    />
  );
}

/**
 * "Services & prices": category chips over one card per active service —
 * its photo, name and description, turnaround and rush, price with its unit,
 * and an order button. The whole card opens the order form too. Two cards a
 * row from `sm` up (the page's right-hand column leaves too little room for
 * three), one on phones.
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
        <CardGrid
          columns={2}
          sx={{
            mt: 1.75,
            mb: 2.25,
            // From `sm`, not `CardGrid`'s `md`: the panel is full width
            // until the rail moves beside it at `lg`.
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
            gridAutoRows: { xs: 'auto', sm: '1fr' },
          }}
        >
          {shown.map((s) => (
            <ProfileServiceCard key={s.id} service={s} orderHref={orderHref} />
          ))}
        </CardGrid>
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
