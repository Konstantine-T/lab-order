import { useState, type ReactNode } from 'react';
import { alpha, Box, Button, Card, Typography, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design/Icon';
import { pickText, useLabText } from '@/features/lab/labText';
import { pickPriceList, priceListUrl } from '@/features/lab/priceList/priceListApi';
import {
  featuredService,
  shownPrice,
  type CatalogueLab,
  type CatalogueService,
} from '@/features/catalog/catalogue';
import { priceLabel } from '@/features/catalog/catalogueText';
import { LiveDot, VerifiedMark } from '@/features/catalog/labDesign';
import { isNewLab, pillActionSx, pillSize, tiltSurfaceSx } from '@/features/catalog/labStyles';
import { useCardTilt } from '@/features/catalog/useCardTilt';
import { formatAverage, ratingOf, shownRating } from '@/features/reviews/rating';
import { DARK, labCardMotion, lift, palette2026, radii, surfaces, tone, initialsOf } from '@/theme/tokens';

/** Service chips before "+N". */
const CHIPS_SHOWN = 4;

const NO_MATERIALS: readonly string[] = [];

/** Below this card width the stats stack 2×2 and the action takes its own row. */
const NARROW = '@container (max-width: 400px)';

/** A one-column card can be 700px wide; its cover stays a banner. */
const COVER_MAX_HEIGHT = 240;

/** Raised above the stretched profile link, so these win clicks in their area. */
const ABOVE = { position: 'relative', zIndex: 1 } as const;

/** The cover: the lab's picture, else its band with a tooth. */
function LabCover({ src, badge }: { src: string | null; badge?: ReactNode }) {
  // The URL that failed, not a flag: a new picture gets its own chance to load.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const showImage = !!src && brokenSrc !== src;
  return (
    <Box
      sx={{
        position: 'relative',
        aspectRatio: '16 / 8',
        maxHeight: COVER_MAX_HEIGHT,
        flexShrink: 0,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        background: `linear-gradient(135deg, ${palette2026.ink}, ${palette2026.ink2})`,
      }}
    >
      {showImage ? (
        <Box
          component="img"
          data-lab-cover
          src={src}
          alt=""
          loading="lazy"
          onError={() => setBrokenSrc(src)}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: `transform ${labCardMotion.zoom}`,
          }}
        />
      ) : (
        <Icon name="dentistry" size={44} sx={{ color: alpha(palette2026.inkText, 0.45) }} />
      )}
      {badge && (
        <Box
          component="span"
          sx={{
            position: 'absolute',
            top: 10,
            right: 10,
            display: 'inline-flex',
            alignItems: 'center',
            height: 22,
            px: 1,
            borderRadius: '6px',
            bgcolor: alpha(palette2026.ink, 0.7),
            color: 'common.white',
            fontSize: '0.65625rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {badge}
        </Box>
      )}
    </Box>
  );
}

/** The lab's logo, or its initials (also when the logo fails to load), over the cover. */
function LabTile({ logo, name }: { logo: string | null; name: string }) {
  const theme = useTheme();
  const s = surfaces[theme.palette.mode];
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const sx = {
    // Positioned, or the positioned cover it overlaps would paint over it.
    position: 'relative',
    width: 56,
    height: 56,
    mt: '-10px',
    flexShrink: 0,
    borderRadius: `${radii.labLogo}px`,
    border: '3px solid',
    borderColor: 'background.paper',
  } as const;
  if (logo && brokenSrc !== logo) {
    return (
      <Box
        component="img"
        src={logo}
        alt=""
        loading="lazy"
        onError={() => setBrokenSrc(logo)}
        // `contain`: a wide logo shows whole instead of losing its edges.
        sx={{ ...sx, display: 'block', objectFit: 'contain', p: '5px', bgcolor: s.chip }}
      />
    );
  }
  return (
    <Box
      aria-hidden
      sx={{
        ...sx,
        display: 'grid',
        placeItems: 'center',
        bgcolor: theme.palette.mode === 'light' ? palette2026.ink : s.chip,
        color: 'common.white',
        fontSize: '1.0625rem',
        fontWeight: 800,
      }}
    >
      {initialsOf(name)}
    </Box>
  );
}

type StatProps = {
  value: ReactNode;
  /** Small, straight after the number: a rating's "/5", a price's "/ tooth". */
  unit?: string;
  label: string;
  /** A lab's own text, of any length: it clips to its figure's column, never widens it. */
  longLabel?: boolean;
};

/** One figure of the row under the name: a number, and what it counts. */
function Stat({ value, unit, label, longLabel }: StatProps) {
  const oneLine = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <Box
        component="b"
        sx={{
          ...oneLine,
          fontSize: '1rem',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {unit && (
          <Box component="small" sx={{ fontSize: '0.6875rem', fontWeight: 600, color: 'text.secondary' }}>
            {unit}
          </Box>
        )}
      </Box>
      <Box
        component="span"
        sx={{
          ...oneLine,
          fontSize: '0.6875rem',
          color: 'text.secondary',
          ...(longLabel && { width: 0, minWidth: '100%' }),
        }}
      >
        {label}
      </Box>
    </Box>
  );
}

/**
 * A lab in the catalogue, as in the labs.html mockup: a cover with the logo
 * overlapping it, the name and place, a row of figures, the services with their
 * prices, and a footer with the action. Below 400px of card width (a phone) the
 * figures stack 2×2 and the action takes a full row.
 *
 * Every figure is real: the mockup's orders, on-time and reply-time figures have
 * no data behind them yet, so the row carries the rating, the featured price, the
 * turnaround and the service count, and leaves out whatever a lab cannot show —
 * the rating until three reviews (J3), never a "no reviews" that would mark
 * a new lab down.
 *
 * The card is a container, not a link: the name stretches over the whole card
 * (its ::after), so a click anywhere opens the lab — with ctrl/middle-click
 * intact — while the action, the price list and "+N" sit above it as sibling
 * links, never nested in it.
 */
export function LabCard({
  lab,
  profileTo,
  isHighlighted,
  materials = NO_MATERIALS,
}: {
  lab: CatalogueLab;
  /** The lab's page, with whatever the URL must carry (the clinic's doctor). */
  profileTo: string;
  /** Services matching the active filters, listed first among the chips. */
  isHighlighted?: (s: CatalogueService) => boolean;
  /** The material filter's keys: prices are then the selected material's. */
  materials?: readonly string[];
}) {
  const { t } = useTranslation('doctor');
  const { labText, lang } = useLabText();
  const theme = useTheme();
  const s = surfaces[theme.palette.mode];
  const light = theme.palette.mode === 'light';
  const linkColor = light ? palette2026.periText : DARK.periLight;
  const tiltRef = useCardTilt<HTMLDivElement>();

  const name = labText(lab, 'public_name');
  const priceList = pickPriceList(lab.price_lists, lang);
  // A service's name in the reader's language (0042), else the lab's own.
  const serviceName = (x: CatalogueService) => pickText(x.name, x.translations, 'name', lang);
  const featured = featuredService(lab, isHighlighted, materials, lang);
  const featuredPrice = featured ? priceLabel(featured.price, t) : null;
  // The order button opens the lab's services to pick from, never the
  // featured one: that price is information, not a pre-chosen order.
  const orderable = lab.services.some((x) => x.orderable);
  const rating = shownRating(ratingOf(lab.ratingSummary));

  const turnaround = !lab.turnaround
    ? null
    : lab.turnaround.min === lab.turnaround.max
      ? t('marketplace.days', { count: lab.turnaround.min })
      : `${lab.turnaround.min}–${lab.turnaround.max} ${t('marketplace.daysUnit')}`;
  const offersRush = lab.services.some((x) => x.orderable && x.rush);

  // Matching services first (when filters are on), then priced ones, then
  // the lab's own order — `sort` is stable, so the last rule is free.
  const rank = (x: CatalogueService) =>
    (isHighlighted?.(x) ? 2 : 0) + (x.from ? 1 : 0);
  const chips = [...lab.services].sort((a, b) => rank(b) - rank(a)).slice(0, CHIPS_SHOWN);
  const more = lab.services.length - chips.length;

  const where = [lab.city, lab.working_address].filter(Boolean).join(' · ');

  const stats: (StatProps & { key: string })[] = [];
  if (rating) {
    stats.push({
      key: 'rating',
      value: formatAverage(rating.average ?? 0, lang),
      unit: '/5',
      label: t('reviews.count', { count: rating.count }),
    });
  }
  if (featured && featuredPrice) {
    stats.push({
      key: 'price',
      value: featuredPrice,
      unit: featured.price.per === 'order' ? undefined : ` ${t(`marketplace.per.${featured.price.per}`)}`,
      // With a material filter on, the price is that material's: say which.
      label: featured.price.material ?? serviceName(featured.service),
      longLabel: true,
    });
  }
  if (turnaround) {
    stats.push({ key: 'turnaround', value: turnaround, label: t('marketplace.card.turnaround') });
  }
  if (lab.services.length > 0) {
    stats.push({
      key: 'services',
      value: lab.services.length,
      label: t('marketplace.card.servicesLabel', { count: lab.services.length }),
    });
  }

  const chipSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    maxWidth: '100%',
    height: 28,
    px: '9px',
    borderRadius: `${radii.chipSm}px`,
    bgcolor: s.chip,
    fontSize: '0.78125rem',
    fontWeight: 600,
  } as const;
  const linkChipSx = {
    ...chipSx,
    ...ABOVE,
    color: linkColor,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    '&:hover': { textDecoration: 'underline' },
  } as const;

  return (
    <Card
      ref={tiltRef}
      component="article"
      aria-label={name}
      sx={{
        position: 'relative',
        containerType: 'inline-size',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: `${radii.labCard}px`,
        color: 'text.primary',
        boxShadow: lift.labCard,
        ...tiltSurfaceSx,
        '@media (hover: hover)': {
          '&:hover': { boxShadow: lift.labCardHover },
          '&:hover [data-lab-cover]': { transform: 'scale(1.05)' },
        },
        '@media (prefers-reduced-motion: reduce)': {
          transform: 'none',
          '& [data-lab-cover]': { transform: 'none !important', transition: 'none' },
        },
      }}
    >
      <LabCover src={lab.cover} badge={isNewLab(lab.created_at) ? t('marketplace.new') : undefined} />

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5, px: 2.25, pb: 2.25 }}>
        {/* Logo, name and where it is. */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <LabTile logo={lab.logo_url} name={name} />
          <Box sx={{ minWidth: 0, flex: 1, pt: '3px', pb: '2px' }}>
            <Typography
              component="h2"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '1.0625rem',
                fontWeight: 700,
                lineHeight: 1.4,
              }}
            >
              <Box
                component={RouterLink}
                to={profileTo}
                aria-label={t('marketplace.card.profileA11y', { name })}
                sx={{
                  minWidth: 0,
                  color: 'inherit',
                  textDecoration: 'none',
                  overflowWrap: 'anywhere',
                  // Two lines, not the mockup's one: a Georgian lab's name is
                  // often long, and it is the one thing here that must not clip.
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  // Stretched over the whole card: a click anywhere opens the
                  // lab, and it stays a real link for ctrl/middle-click.
                  '&::after': { content: '""', position: 'absolute', inset: 0 },
                  '&:focus-visible': { outline: 'none' },
                  '&:focus-visible::after': {
                    outline: `3px solid ${tone('success', theme.palette.mode).dot}`,
                    outlineOffset: '-3px',
                    borderRadius: `${radii.labCard}px`,
                  },
                }}
              >
                {name}
              </Box>
              <VerifiedMark />
            </Typography>
            {where && (
              <Box
                component="span"
                sx={{
                  display: 'block',
                  mt: '1px',
                  fontSize: '0.8125rem',
                  color: 'text.secondary',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {where}
              </Box>
            )}
          </Box>
        </Box>

        {stats.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              // Sized by their figures, the spare room shared out: "20 ₾-დან / კბილი"
              // needs three times what "14" does, and equal columns would clip it.
              gridTemplateColumns: `repeat(${stats.length}, minmax(0, auto))`,
              gap: 1,
              py: 1.5,
              borderTop: 1,
              borderBottom: 1,
              borderColor: 'divider',
              ...(stats.length === 4 && { [NARROW]: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } }),
            }}
          >
            {stats.map(({ key, ...stat }) => (
              <Stat key={key} {...stat} />
            ))}
          </Box>
        )}

        {(chips.length > 0 || priceList) && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}>
            {chips.map((x) => {
              const price = priceLabel(shownPrice(x, materials, lang), t);
              return (
                <Box key={x.id} component="span" sx={chipSx}>
                  <Box
                    component="span"
                    sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {serviceName(x)}
                  </Box>
                  {price && (
                    <Box component="b" sx={{ flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {price}
                    </Box>
                  )}
                </Box>
              );
            })}
            {more > 0 && (
              <Box component={RouterLink} to={profileTo} tabIndex={-1} sx={linkChipSx}>
                {t('marketplace.card.moreServices', { n: more })}
              </Box>
            )}
            {priceList && (
              // Labelled, not an icon alone: the card has to say "price list"
              // (XNhSe8D6), and a tooltip never shows on touch.
              <Box
                component="a"
                href={priceListUrl(priceList)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('marketplace.priceListFor', { name })}
                sx={linkChipSx}
              >
                <Icon name="receipt_long" size={15} />
                {t('marketplace.priceList')}
              </Box>
            )}
          </Box>
        )}

        {!featured && (
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
            {t('marketplace.card.pricesOnProfile')}
          </Typography>
        )}

        {/* `mt: auto`: the footers of a row's cards line up whatever is above them. */}
        <Box
          sx={{
            mt: 'auto',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            columnGap: 1.25,
            rowGap: 1,
            fontSize: '0.78125rem',
            fontWeight: 600,
            color: 'text.secondary',
          }}
        >
          {orderable && (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <LiveDot />
              {t('marketplace.card.accepting')}
            </Box>
          )}
          {offersRush && (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 500 }}>
              <Icon name="bolt" size={15} />
              {t('marketplace.filters.rushChip')}
            </Box>
          )}
          <Button
            component={RouterLink}
            to={orderable ? `${profileTo}#lab-services` : profileTo}
            variant="contained"
            size="small"
            aria-label={t(orderable ? 'marketplace.card.orderA11y' : 'marketplace.card.profileA11y', { name })}
            sx={{
              ...pillActionSx(theme.palette.mode),
              ...pillSize.sm,
              ...ABOVE,
              ml: 'auto',
              flexShrink: 0,
              [NARROW]: { ml: 0, width: '100%' },
            }}
          >
            {orderable ? t('labProfile.orderCta') : t('marketplace.card.profile')}
          </Button>
        </Box>
      </Box>
    </Card>
  );
}
