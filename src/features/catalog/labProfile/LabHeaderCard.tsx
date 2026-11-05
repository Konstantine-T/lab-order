import { useState, type ReactNode } from 'react';
import { Box, Button, IconButton, Link, Snackbar, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon, StatusPill } from '@/components/design';
import { whatsappUrl } from '@/features/labs/whatsapp';
import { useLabText } from '@/features/lab/labText';
import { pickPriceList, priceListUrl } from '@/features/lab/priceList/priceListApi';
import { StarRow, VerifiedMark } from '@/features/catalog/labDesign';
import { isNewLab, pillActionSx, pillOutlineSx, pillSize } from '@/features/catalog/labStyles';
import { PUBLIC_ROUTES } from '@/features/public/publicRoutes';
import { formatAverage, shownRating, type LabRating } from '@/features/reviews/rating';
import { DARK, initialsOf, lift, palette2026, surfaces } from '@/theme/tokens';
import {
  amountText,
  featuredProfilePrice,
  jumpToSection,
  panelSx,
  rangeText,
  rushSummary,
  SECTION,
  turnaroundRange,
  unitText,
} from './format';
import type { ProfileLab, ProfileService } from './useLabProfile';

/** Below this card width the actions drop under the name and share a row. */
const STACKED = '@container (max-width: 720px)';
/** The stats' mockup ladder: all across, then three, then two. */
const THREE_STATS = '@container (max-width: 900px)';
const TWO_STATS = '@container (max-width: 560px)';

/**
 * The lab's logo, or its initials on the mockup's ink tile (also when the logo
 * fails to load). The mockup hangs it off a cover; with no cover yet it sits
 * inside the card.
 */
function LogoTile({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const theme = useTheme();
  const s = surfaces[theme.palette.mode];
  // The URL that failed, not a flag: a new logo gets its own chance to load.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const sx = {
    width: 112,
    height: 112,
    flexShrink: 0,
    borderRadius: '28px',
    boxShadow: lift.labProfileLogo,
    [STACKED]: { width: 84, height: 84, borderRadius: '22px' },
  } as const;

  if (logoUrl && brokenSrc !== logoUrl) {
    return (
      <Box
        component="img"
        src={logoUrl}
        alt=""
        onError={() => setBrokenSrc(logoUrl)}
        // `contain`: a wide logo shows whole instead of losing its edges.
        sx={{ ...sx, display: 'block', objectFit: 'contain', p: '10px', bgcolor: s.chip }}
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
        fontSize: '2.25rem',
        fontWeight: 800,
        letterSpacing: '-0.02em',
        userSelect: 'none',
        [STACKED]: { ...sx[STACKED], fontSize: '1.75rem' },
      }}
    >
      {initialsOf(name)}
    </Box>
  );
}

/** One figure of the row across the card: a number, and what it counts. */
function Stat({ value, unit, children }: { value: ReactNode; unit?: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
      <Box
        component="b"
        sx={{
          fontSize: '1.625rem',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
          [TWO_STATS]: { fontSize: '1.375rem' },
        }}
      >
        {value}
        {unit && (
          <Box
            component="small"
            sx={{ ml: '3px', fontSize: '0.8125rem', fontWeight: 600, letterSpacing: 0, color: 'text.secondary' }}
          >
            {unit}
          </Box>
        )}
      </Box>
      {children}
    </Box>
  );
}

const statLabelSx = {
  fontSize: '0.78125rem',
  color: 'text.secondary',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

/**
 * The top of a lab's profile (lab.html): logo, name and place, the actions, and
 * a row of figures. Every figure is real: the rating (from three reviews on,
 * J3), the price it leads with, its turnaround, its services and its rush; a
 * lab that cannot show one simply has fewer. The mockup's orders, on-time and
 * reply figures have no data behind them yet.
 */
export function LabHeaderCard({
  lab,
  services,
  rating,
  onOrder,
  canOrder,
}: {
  lab: ProfileLab;
  services: ProfileService[];
  rating: LabRating | null | undefined;
  /** "New order": every order starts from one of the lab's services. */
  onOrder: () => void;
  canOrder: boolean;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { labText, lang } = useLabText();
  const theme = useTheme();
  const mode = theme.palette.mode;
  const [copied, setCopied] = useState(false);

  const name = labText(lab, 'public_name');
  const place = [lab.city?.trim(), lab.working_address?.trim()].filter(Boolean).join(' · ');
  // The file in the reader's language, else whichever exists (ka → en → ru).
  const priceList = pickPriceList(lab.price_lists, lang);
  const wa = whatsappUrl(lab.contact_phone);

  const shown = shownRating(rating);
  const featured = featuredProfilePrice(services);
  const range = turnaroundRange(services);
  const rush = rushSummary(services, tc);
  const stats: { key: string; node: ReactNode }[] = [];

  if (shown?.average) {
    const average = formatAverage(shown.average, lang);
    stats.push({
      key: 'rating',
      node: (
        <Stat value={average} unit="/5">
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1 }}>
            <StarRow value={shown.average} />
            <Link
              href={`#${SECTION.reviews}`}
              underline="hover"
              aria-label={t('reviews.ratedA11y', { average, count: shown.count })}
              onClick={(e) => {
                e.preventDefault();
                jumpToSection(SECTION.reviews);
              }}
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                color: mode === 'light' ? palette2026.periText : DARK.periLight,
              }}
            >
              {t('reviews.count', { count: shown.count })}
            </Link>
          </Box>
        </Stat>
      ),
    });
  }
  if (featured) {
    stats.push({
      key: 'price',
      node: (
        <Stat value={amountText(featured.price, t)} unit={unitText(featured.price, t)}>
          <Box component="span" title={featured.service.name} sx={statLabelSx}>
            {featured.service.name}
          </Box>
        </Stat>
      ),
    });
  }
  if (range) {
    stats.push({
      key: 'turnaround',
      node: (
        <Stat value={rangeText(range, t)}>
          <Box component="span" sx={statLabelSx}>
            {t('marketplace.card.turnaround')}
          </Box>
        </Stat>
      ),
    });
  }
  if (services.length > 0) {
    stats.push({
      key: 'services',
      node: (
        <Stat value={services.length}>
          <Box component="span" sx={statLabelSx}>
            {t('marketplace.card.servicesLabel', { count: services.length })}
          </Box>
        </Stat>
      ),
    });
  }
  if (rush.offered) {
    stats.push({
      key: 'rush',
      node: (
        <Stat value={rush.surcharge ?? t('marketplace.days', { count: rush.days ?? 0 })}>
          <Box component="span" sx={statLabelSx}>
            {t('marketplace.card.rushLabel')}
          </Box>
        </Stat>
      ),
    });
  }

  const share = async () => {
    // Always the public address: the visitor's own may be `/doctor/…`, which a
    // colleague without a login can't open, and may carry `?doctor=` or a patient.
    const url = new URL(PUBLIC_ROUTES.lab(lab.id), window.location.origin).href;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      // The reader closed the share sheet, or the browser refused: nothing to say.
    }
  };

  return (
    <Box
      sx={[
        panelSx,
        {
          containerType: 'inline-size',
          px: { xs: 2, sm: 3.5 },
          pt: { xs: 2, sm: 3 },
          pb: { xs: 2.25, sm: 3 },
          boxShadow: lift.labProfile,
        },
      ]}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          // The actions take a row of their own rather than squeeze the name.
          flexWrap: 'wrap',
          columnGap: '22px',
          rowGap: 2,
          [STACKED]: {
            flexDirection: 'column',
            flexWrap: 'nowrap',
            alignItems: 'flex-start',
            gap: '10px',
          },
        }}
      >
        <LogoTile name={name} logoUrl={lab.logo_url} />

        <Box
          sx={{
            flex: '1 1 360px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            [STACKED]: { flex: '0 0 auto', width: '100%' },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.25 }}>
            {/* Together, so a long name wraps inside its own box and the check
                stays beside it instead of dropping to a line of its own. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
              <Typography
                component="h1"
                sx={{
                  fontSize: '1.875rem',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                  [STACKED]: { fontSize: '1.5rem' },
                }}
              >
                {name}
              </Typography>
              <VerifiedMark />
            </Box>
            {isNewLab(lab.created_at) && <StatusPill tone="neutral">{t('marketplace.new')}</StatusPill>}
          </Box>
          {place && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                fontSize: '0.84375rem',
                color: 'text.secondary',
                minWidth: 0,
              }}
            >
              <Icon name="location_on" size={15} sx={{ color: surfaces[mode].textMuted }} />
              <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {place}
              </Box>
            </Box>
          )}
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexShrink: 0,
            [STACKED]: {
              width: '100%',
              flexWrap: 'wrap',
              pt: 0.5,
              '& > a, & > button:not(.MuiIconButton-root)': { flex: '1 1 140px' },
            },
          }}
        >
          <IconButton
            onClick={share}
            aria-label={t('labProfile.share')}
            title={t('labProfile.share')}
            sx={{
              width: 44,
              height: 44,
              border: 1,
              borderColor: surfaces[mode].control,
              borderRadius: '50%',
              color: 'text.primary',
              [STACKED]: { display: 'none' },
            }}
          >
            <Icon name="share" size={18} />
          </IconButton>
          {priceList && (
            <Button
              component="a"
              href={priceListUrl(priceList)}
              target="_blank"
              rel="noopener noreferrer"
              variant="outlined"
              startIcon={<Icon name="receipt_long" size={17} />}
              aria-label={t('labProfile.priceListA11y')}
              sx={{ ...pillOutlineSx, ...pillSize.md }}
            >
              {t('labProfile.priceList')}
            </Button>
          )}
          {wa && (
            <Button
              component="a"
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              variant="outlined"
              startIcon={<Icon name="chat_bubble" size={17} />}
              aria-label={t('labProfile.contact.whatsappA11y')}
              sx={{ ...pillOutlineSx, ...pillSize.md }}
            >
              {t('labProfile.message')}
            </Button>
          )}
          <Button
            variant="contained"
            disabled={!canOrder}
            onClick={onOrder}
            startIcon={<Icon name="send" size={17} />}
            sx={{ ...pillActionSx(mode), ...pillSize.md }}
          >
            {t('labProfile.orderCard.cta')}
          </Button>
        </Box>
      </Box>

      {stats.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
            gap: '14px',
            mt: '22px',
            pt: 2.5,
            borderTop: 1,
            borderColor: 'divider',
            ...(stats.length > 3 && { [THREE_STATS]: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } }),
            ...(stats.length > 2 && {
              [TWO_STATS]: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', mt: 2, pt: 2 },
            }),
          }}
        >
          {stats.map((x) => (
            <Box key={x.key} sx={{ display: 'contents' }}>
              {x.node}
            </Box>
          ))}
        </Box>
      )}

      <Snackbar
        open={copied}
        autoHideDuration={2500}
        onClose={() => setCopied(false)}
        message={tc('actions.copied')}
      />
    </Box>
  );
}
