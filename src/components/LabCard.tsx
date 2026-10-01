import { alpha, Box, Button, Card, Stack, Typography, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design/Icon';
import { StatusPill } from '@/components/design/StatusPill';
import { useLabText } from '@/features/lab/labText';
import { pickPriceList, priceListUrl } from '@/features/lab/priceList/priceListApi';
import {
  featuredService,
  shownPrice,
  type CatalogueLab,
  type CatalogueService,
} from '@/features/catalog/catalogue';
import { priceLabel, rushNote } from '@/features/catalog/catalogueText';
import { avatarColor, brand, initialsOf, lift, palette2026, radii, surfaces } from '@/theme/tokens';

/** Days-old threshold for the NEW badge. */
const NEW_FOR_DAYS = 30;

/** Service chips before "+N". */
const CHIPS_SHOWN = 4;

const NO_MATERIALS: readonly string[] = [];

/** Below this card width the price column drops under the body. */
const WIDE = '@container (min-width: 640px)';

/** The lab's logo, or its initials on a tile coloured from its base name. */
function LabTile({ lab, name }: { lab: CatalogueLab; name: string }) {
  const theme = useTheme();
  const sx = {
    width: 52,
    height: 52,
    [WIDE]: { width: 72, height: 72, borderRadius: '14px', fontSize: '1.125rem' },
    flexShrink: 0,
    borderRadius: `${radii.card}px`,
    gridArea: 'tile',
    alignSelf: 'start',
  } as const;
  if (lab.logo_url) {
    return (
      <Box
        component="img"
        src={lab.logo_url}
        alt=""
        loading="lazy"
        sx={{ ...sx, objectFit: 'cover', bgcolor: surfaces[theme.palette.mode].chip }}
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
        // Keyed to the base name so a lab keeps its colour in every language;
        // the initials follow the name the reader sees.
        bgcolor: avatarColor(lab.public_name),
        color: '#fff',
        fontSize: '0.9375rem',
        fontWeight: 800,
        letterSpacing: '0.01em',
      }}
    >
      {initialsOf(name)}
    </Box>
  );
}

/**
 * A lab in the catalogue, laid out as the redesign's horizontal card: tile,
 * name and facts, service chips with prices, and a right-hand column with the
 * featured price and the two actions. Below 640px of card width (a phone, or
 * a tablet with the filter column open) the price column moves under the body.
 *
 * The card is a container, not a link: the "Profile" button stretches over
 * the whole card (its ::after), so a click anywhere opens the lab — with
 * ctrl/middle-click intact — while the order button, the price-list button
 * and "+N" sit above it as sibling links, never nested in it.
 */
export function LabCard({
  lab,
  profileTo,
  orderHrefFor,
  onOrderIntent,
  isHighlighted,
  materials = NO_MATERIALS,
}: {
  lab: CatalogueLab;
  /** The lab's page, with whatever the URL must carry (the clinic's doctor). */
  profileTo: string;
  /** The order form for one of the lab's services. */
  orderHrefFor: (serviceId: string) => string;
  /** Hover / focus / touch on the order button — the guest wizard warms up. */
  onOrderIntent?: () => void;
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
  const linkColor = light ? palette2026.periText : brand.soft;

  const name = labText(lab, 'public_name');
  const description = labText(lab, 'short_description');
  const priceList = pickPriceList(lab.price_lists, lang);
  const featured = featuredService(lab, isHighlighted, materials);
  const featuredPrice = featured ? priceLabel(featured.price, t) : null;
  // "Crown · Zirconia" (for the order button's label) when the price is one
  // material's, as the lab spells it.
  const featuredName = featured
    ? [featured.service.name, featured.price.material].filter(Boolean).join(' · ')
    : null;

  const isNew =
    !!lab.created_at &&
    Date.now() - new Date(lab.created_at).getTime() < NEW_FOR_DAYS * 24 * 60 * 60 * 1000;

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

  // Raised above the stretched profile link, so these win clicks in their area.
  const above = { position: 'relative', zIndex: 1 } as const;

  // Labelled, not an icon alone: the card has to say "price list" (XNhSe8D6),
  // and a tooltip never shows on touch. A text button on its own row keeps it
  // lighter than the two actions above it.
  const priceListButton = priceList && (
    <Button
      component="a"
      href={priceListUrl(priceList)}
      target="_blank"
      rel="noopener noreferrer"
      size="small"
      startIcon={<Icon name="receipt_long" size={16} />}
      aria-label={t('marketplace.priceListFor', { name })}
      sx={{ ...above, flex: '1 1 100%', [WIDE]: { flex: 'none' } }}
    >
      {t('marketplace.priceList')}
    </Button>
  );

  return (
    <Card
      component="article"
      aria-label={name}
      sx={{
        position: 'relative',
        containerType: 'inline-size',
        p: { xs: 2, sm: 2.5 },
        color: 'text.primary',
        '&:hover': { borderColor: alpha(palette2026.peri, 0.6), boxShadow: lift.card },
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '52px minmax(0, 1fr)',
          gridTemplateAreas: '"tile head" "body body" "side side"',
          columnGap: 1.75,
          rowGap: 1.5,
          [WIDE]: {
            gridTemplateColumns: '72px minmax(0, 1fr) 196px',
            gridTemplateRows: 'auto 1fr',
            gridTemplateAreas: '"tile head side" "tile body side"',
            columnGap: 2.5,
            rowGap: 1.25,
          },
        }}
      >
        <LabTile lab={lab} name={name} />

        {/* Name, badge and where it is. */}
        <Box sx={{ gridArea: 'head', minWidth: 0, alignSelf: 'center' }}>
          <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', columnGap: 1, rowGap: 0.5 }}>
            <Typography
              component="h2"
              sx={{
                fontSize: { xs: '1rem', sm: '1.125rem' },
                fontWeight: 600,
                lineHeight: 1.35,
                letterSpacing: '-0.005em',
                minWidth: 0,
                overflowWrap: 'anywhere',
              }}
            >
              {name}
            </Typography>
            {isNew && <StatusPill tone="neutral">{t('marketplace.new')}</StatusPill>}
          </Stack>
          {where && (
            <Typography
              sx={{ mt: 0.375, fontSize: '0.8125rem', color: 'text.secondary', overflowWrap: 'anywhere' }}
            >
              {where}
            </Typography>
          )}
        </Box>

        {/* Description, services, facts. */}
        <Stack spacing={1.25} useFlexGap sx={{ gridArea: 'body', minWidth: 0 }}>
          {description && (
            <Typography
              sx={{
                fontSize: '0.8125rem',
                lineHeight: 1.55,
                color: 'text.secondary',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {description}
            </Typography>
          )}

          {chips.length > 0 && (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}>
              {chips.map((x) => {
                const price = priceLabel(shownPrice(x, materials), t);
                return (
                  <Box
                    key={x.id}
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.625,
                      maxWidth: '100%',
                      minHeight: 26,
                      px: 1.125,
                      py: 0.25,
                      borderRadius: `${radii.chipSm}px`,
                      bgcolor: s.subtle,
                      border: 1,
                      borderColor: s.borderSolid,
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      color: s.chipText,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {x.name}
                    </Box>
                    {price && (
                      <Box
                        component="span"
                        sx={{ flexShrink: 0, fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap' }}
                      >
                        {price}
                      </Box>
                    )}
                  </Box>
                );
              })}
              {more > 0 && (
                <Box
                  component={RouterLink}
                  to={profileTo}
                  tabIndex={-1}
                  sx={{
                    ...above,
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 26,
                    px: 1.125,
                    borderRadius: `${radii.chipSm}px`,
                    bgcolor: s.subtle,
                    border: 1,
                    borderColor: s.borderSolid,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: linkColor,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    '&:hover': { borderColor: brand.main },
                  }}
                >
                  {t('marketplace.card.moreServices', { n: more })}
                </Box>
              )}
            </Stack>
          )}

          <Stack
            direction="row"
            alignItems="center"
            sx={{
              flexWrap: 'wrap',
              columnGap: 2,
              rowGap: 0.5,
              pt: 1.25,
              mt: 'auto',
              borderTop: 1,
              borderColor: 'divider',
              fontSize: '0.8125rem',
              color: 'text.secondary',
            }}
          >
            {turnaround && (
              <Stack direction="row" alignItems="center" spacing={0.625}>
                <Icon name="schedule" size={16} />
                <span>
                  {t('marketplace.card.turnaround')}{' '}
                  <Box component="b" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    {turnaround}
                  </Box>
                </span>
              </Stack>
            )}
            <Stack direction="row" alignItems="center" spacing={0.625}>
              <Icon name="category" size={16} />
              <span>{t('marketplace.servicesCount', { count: lab.services.length })}</span>
            </Stack>
            {offersRush && (
              <Stack direction="row" alignItems="center" spacing={0.625}>
                <Icon name="bolt" size={16} />
                <span>{t('marketplace.card.rushAvailable')}</span>
              </Stack>
            )}
          </Stack>
        </Stack>

        {/* Featured price and the actions. */}
        <Stack
          sx={{
            gridArea: 'side',
            minWidth: 0,
            pt: 1.5,
            borderTop: 1,
            borderColor: 'divider',
            gap: 1,
            [WIDE]: { pt: 0, pl: 2.5, borderTop: 0, borderLeft: 1, borderColor: 'divider' },
          }}
        >
          <Box sx={{ pb: 0.5 }}>
            {featured && featuredPrice ? (
              <>
                <Typography
                  sx={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    color: 'text.secondary',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {featured.service.name}
                </Typography>
                {/* Its own line, so a long service name can never clip it. */}
                {featured.price.material && (
                  <Typography
                    sx={{
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                      color: 'text.primary',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {featured.price.material}
                  </Typography>
                )}
                <Typography component="p" sx={{ mt: 0.25, lineHeight: 1.25 }}>
                  <Box
                    component="span"
                    sx={{ fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.01em' }}
                  >
                    {featuredPrice}
                  </Box>
                  {featured.price.per !== 'order' && (
                    <Box component="span" sx={{ ml: 0.5, fontSize: '0.8125rem', color: 'text.secondary' }}>
                      {t(`marketplace.per.${featured.price.per}`)}
                    </Box>
                  )}
                </Typography>
                {featured.service.rush && (
                  <Typography sx={{ mt: 0.25, fontSize: '0.75rem', color: 'text.secondary' }}>
                    {rushNote(featured.service.rush, t)}
                  </Typography>
                )}
              </>
            ) : (
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                {t('marketplace.card.pricesOnProfile')}
              </Typography>
            )}
          </Box>

          <Box
            sx={{
              mt: 'auto',
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              [WIDE]: { flexDirection: 'column', flexWrap: 'nowrap' },
            }}
          >
            {featured && (
              <Button
                component={RouterLink}
                to={orderHrefFor(featured.service.id)}
                variant="contained"
                aria-label={t('marketplace.card.orderA11y', { service: featuredName, name })}
                onPointerEnter={onOrderIntent}
                onFocus={onOrderIntent}
                onTouchStart={onOrderIntent}
                sx={{ ...above, flex: { xs: '1 1 140px' }, [WIDE]: { flex: 'none' } }}
              >
                {t('labProfile.orderCta')}
              </Button>
            )}
            <Button
              component={RouterLink}
              to={profileTo}
              variant={featured ? 'outlined' : 'contained'}
              aria-label={t('marketplace.card.profileA11y', { name })}
              // No ripple: with the button unpositioned (below), the ripple
              // layer would spread over the whole card.
              disableRipple
              sx={{
                flex: { xs: '1 1 160px' },
                [WIDE]: { flex: 'none' },
                minWidth: 0,
                // Static, so the ::after below is placed against the card,
                // not against the button (ButtonBase is position: relative).
                position: 'static',
                // Stretched over the whole card: a click anywhere opens the
                // lab, and it stays a real link for ctrl/middle-click.
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  borderRadius: `${radii.card}px`,
                },
              }}
            >
              {t('marketplace.card.profile')}
            </Button>
            {priceListButton}
          </Box>
        </Stack>
      </Box>
    </Card>
  );
}
