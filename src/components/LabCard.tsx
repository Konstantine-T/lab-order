import { alpha, Box, Card, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design/Icon';
import { StatusPill } from '@/components/design/StatusPill';
import { useLabText } from '@/features/lab/labText';
import { pickPriceList, priceListUrl } from '@/features/lab/priceList/priceListApi';
import { brand, motion, radii } from '@/theme/tokens';
import { formatGELShort, type StartingPrice } from '@/utils/pricing';

/** A lab plus its active services, as the marketplace query returns it. */
export type MarketplaceLab = {
  id: string;
  public_name: string;
  city: string | null;
  short_description: string | null;
  logo_url: string | null;
  created_at?: string | null;
  /** Per-language name / description (0037); read through `labText`. */
  public_translations?: unknown;
  /** Per-language price-list files (0038); read through `pickPriceList`. */
  price_lists?: unknown;
  services?: {
    name: string;
    average_turnaround_days: number | null;
    /** The service's "from" price; null when it can't be ordered or has no number. */
    from?: StartingPrice | null;
  }[];
};

// The mockups give each lab a distinct gradient tile. Picking by name hash
// keeps a given lab's colour stable across renders and sessions.
const GRADIENTS = [
  [brand.main, brand.link],
  ['#EC4899', '#BE185D'],
  ['#10B981', '#047857'],
  ['#0EA5E9', '#0369A1'],
  ['#F59E0B', '#B45309'],
  ['#8A5CF6', '#6D28D9'],
];

const gradientFor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h + seed.charCodeAt(i)) % GRADIENTS.length;
  return GRADIENTS[h];
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase();

/** Days-old threshold for the NEW badge. */
const NEW_FOR_DAYS = 30;

export function LabCard({ lab, to }: { lab: MarketplaceLab; to?: string }) {
  const { t } = useTranslation('doctor');
  const { labText, lang } = useLabText();
  const target = to ?? `/doctor/labs/${lab.id}`;
  const name = labText(lab, 'public_name');
  const description = labText(lab, 'short_description');
  // The colour stays keyed to the base name so a lab keeps its tile across
  // languages; the initials follow the name the reader actually sees.
  const [from, toColor] = gradientFor(lab.public_name);
  const services = lab.services ?? [];
  const priceList = pickPriceList(lab.price_lists, lang);

  // Turnaround is per-service in the schema; the card shows the range across
  // this lab's active services, matching the mockup's single "3-7 days" line.
  const days = services
    .map((s) => s.average_turnaround_days)
    .filter((d): d is number => typeof d === 'number' && d > 0)
    .sort((a, b) => a - b);
  const turnaround =
    days.length === 0
      ? null
      : days[0] === days[days.length - 1]
        ? t('marketplace.days', { count: days[0] })
        : `${days[0]}–${days[days.length - 1]} ${t('marketplace.daysUnit')}`;

  const isNew =
    !!lab.created_at &&
    Date.now() - new Date(lab.created_at).getTime() < NEW_FOR_DAYS * 24 * 60 * 60 * 1000;

  // The card is a container, not a link: the "View services" CTA is the link
  // and stretches over the whole card (its ::after), so a click anywhere still
  // opens the lab — with ctrl/middle-click and "open in new tab" intact — while
  // the price-list link sits above it as a sibling anchor, never nested in it.
  return (
    <Card
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        p: 2.75,
        borderRadius: '18px',
        color: 'text.primary',
        transition: `border-color ${motion.slow}, box-shadow ${motion.slow}`,
        '&:hover': {
          borderColor: alpha(brand.main, 0.6),
          boxShadow: `0 12px 32px ${alpha(brand.main, 0.14)}`,
        },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.625}>
        <Box
          sx={{
            width: 46,
            height: 46,
            borderRadius: '14px',
            flexShrink: 0,
            background: lab.logo_url
              ? `center/cover url(${lab.logo_url})`
              : `linear-gradient(135deg, ${from}, ${toColor})`,
            color: '#fff',
            fontSize: '0.875rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {!lab.logo_url && initialsOf(name)}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography
              sx={{ fontSize: '0.96875rem', fontWeight: 800, letterSpacing: '-0.01em' }}
              noWrap
            >
              {name}
            </Typography>
            {isNew && <StatusPill tone="brand">{t('marketplace.new')}</StatusPill>}
          </Stack>
          {lab.city && (
            <Stack direction="row" alignItems="center" spacing={0.625} sx={{ mt: 0.25 }}>
              <Icon name="location_on" size={14} sx={{ color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary" noWrap>
                {lab.city}
              </Typography>
            </Stack>
          )}
        </Box>

        {turnaround && (
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography
              sx={{ fontSize: '0.65625rem', fontWeight: 600, color: 'text.secondary' }}
            >
              {t('marketplace.turnaround')}
            </Typography>
            <Typography sx={{ fontSize: '0.78125rem', fontWeight: 700 }}>{turnaround}</Typography>
          </Box>
        )}
      </Stack>

      {description && (
        <Typography
          sx={{
            mt: 1.5,
            fontSize: '0.78125rem',
            lineHeight: 1.55,
            color: 'text.secondary',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {description}
        </Typography>
      )}

      {services.length > 0 && (
        <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
          {services.slice(0, 4).map((s) => (
            <Box
              key={s.name}
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                bgcolor: 'background.default',
                px: 1.375,
                py: 0.5,
                borderRadius: `${radii.pill}px`,
              }}
            >
              {s.name}
              {s.from && (
                // The landing promises "prices and turnaround" in the
                // catalogue; this is where the first click checks it.
                <Box component="span" sx={{ fontWeight: 800, ml: 0.75 }}>
                  {t('marketplace.fromPrice', { price: formatGELShort(s.from.amount) })}
                </Box>
              )}
            </Box>
          ))}
        </Stack>
      )}

      <Stack
        direction="row"
        alignItems="center"
        sx={{
          mt: 'auto',
          pt: 1.75,
          borderTop: 1,
          borderColor: 'divider',
          // A long services line plus both actions wraps instead of
          // overflowing on a narrow card; the actions stay together, right.
          flexWrap: 'wrap',
          columnGap: 1.25,
          rowGap: 1,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={0.625} sx={{ minWidth: 0 }}>
          <Icon name="verified" size={15} sx={{ color: 'success.main' }} />
          <Typography variant="caption" color="text.secondary" noWrap>
            {t('marketplace.servicesCount', { count: services.length })}
          </Typography>
        </Stack>

        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{ ml: 'auto', flexShrink: 0 }}
        >
          {priceList && (
            <Box
              component="a"
              href={priceListUrl(priceList)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('marketplace.priceListFor', { name })}
              sx={{
                // Above the stretched CTA, so this link wins the click in its
                // own area.
                position: 'relative',
                zIndex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.625,
                px: 1.5,
                py: 0.875,
                borderRadius: '9px',
                border: 1,
                borderColor: 'divider',
                color: 'text.primary',
                bgcolor: 'background.paper',
                fontSize: '0.75rem',
                fontWeight: 700,
                textDecoration: 'none',
                transition: `border-color ${motion.base}, color ${motion.base}`,
                '&:hover': { borderColor: 'primary.main', color: 'primary.dark' },
                '&:focus-visible': {
                  outline: `2px solid ${brand.main}`,
                  outlineOffset: 2,
                },
              }}
            >
              <Icon name="receipt_long" size={15} />
              {t('marketplace.priceList')}
            </Box>
          )}

          <Stack
            component={RouterLink}
            to={target}
            direction="row"
            alignItems="center"
            spacing={0.75}
            aria-label={t('marketplace.viewServicesFor', { name })}
            sx={{
              flexShrink: 0,
              bgcolor: 'primary.main',
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 700,
              textDecoration: 'none',
              px: 1.875,
              py: 1,
              borderRadius: '9px',
              transition: `background-color ${motion.base}`,
              '.MuiCard-root:hover &': { bgcolor: 'primary.dark' },
              '&:focus-visible': {
                outline: `2px solid ${brand.main}`,
                outlineOffset: 2,
              },
              // Stretched over the whole card: clicking anywhere on it opens
              // the lab, and it stays a real link for ctrl/middle-click.
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: 0,
                borderRadius: '18px',
              },
            }}
          >
            {t('marketplace.viewServices')}
            <Icon name="arrow_forward" size={15} />
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}
