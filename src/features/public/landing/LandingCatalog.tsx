import { alpha, Box, Link, Skeleton, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PUBLIC_ROUTES } from '@/features/public/publicRoutes';
import { initialsOf, lift, motion, palette2026, radii } from '@/theme/tokens';
import { formatGELShort } from '@/utils/pricing';
import { useLandingLabs, type LandingLab } from './useLandingLabs';
import { ArrowLink, Container, SectionHead } from './primitives';
import { landingRadii, useLandingTones } from './helpers';

/** How many real labs the teaser shows before the "your lab here" card. */
// One, as in the design — and the owner's call (2026-09-30): the second live
// lab still carries test-looking services ("s & g", "test service"), which
// the copy memo flags as a blocker on the front page. The best-stocked lab
// (most published prices) takes the slot.
const LAB_COUNT = 1;

/**
 * "The catalogue — prices and turnaround": the best-stocked live lab as a
 * card, then a dashed "your lab here" card beside it.
 *
 * The design's lab card also carried a rating, a case count, an on-time
 * percentage and a verified tick. The platform has none of those yet, so the
 * card shows only what a lab has actually published: its services' starting
 * prices, the turnaround range and how many services it offers. For the same
 * reason the design's "first 10 labs get a founder badge" line and its
 * "invite your lab" card are left out.
 *
 * A failed or empty query simply leaves the "your lab here" card on its own —
 * a visitor never sees an error here.
 */
export function LandingCatalog() {
  const { t } = useTranslation('landing');
  const { labs, isLoading, isError } = useLandingLabs(LAB_COUNT);
  const shown = isError ? [] : labs.slice(0, LAB_COUNT);
  const count = isLoading ? LAB_COUNT : shown.length;

  return (
    <Box component="section" aria-labelledby="landing-catalog-title">
      <Container
        sx={{
          pb: { xs: '32px', sm: '80px', lg: '96px' },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: '16px', sm: '32px' },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'flex-end' },
            justifyContent: 'space-between',
            gap: { xs: '8px', sm: '24px' },
          }}
        >
          <SectionHead
            id="landing-catalog-title"
            eyebrow={t('catalog.eyebrow')}
            title={t('catalog.title')}
          />
          <Box sx={{ pb: { sm: '6px' } }}>
            <ArrowLink to={PUBLIC_ROUTES.marketplace}>{t('catalog.viewAll')}</ArrowLink>
          </Box>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              sm: 'repeat(2, minmax(0, 1fr))',
              // The design's lab card is the wider one.
              md: 'minmax(0, 1.3fr) minmax(0, 1fr)',
            },
            gap: { xs: '12px', sm: '20px' },
          }}
        >
          {isLoading
            ? Array.from({ length: LAB_COUNT }, (_, i) => <LabCardSkeleton key={i} />)
            : shown.map((lab) => <LabCard key={lab.id} lab={lab} />)}
          {/* With no lab to show, the dashed card takes the whole row. */}
          <YourLabCard sx={{ gridColumn: { sm: count === 0 ? 'span 2' : 'auto' } }} />
        </Box>
      </Container>
    </Box>
  );
}

function cardSx(border: string) {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    minWidth: 0,
    p: '22px 24px',
    bgcolor: 'background.paper',
    border: 1,
    borderColor: border,
    borderRadius: `${landingRadii.card}px`,
  } as const;
}

function LabCard({ lab }: { lab: LandingLab }) {
  const { t } = useTranslation('landing');
  const { t: td } = useTranslation('doctor');
  const tones = useLandingTones();

  // The same "2–5 days" the marketplace's own cards print.
  const turnaround = !lab.turnaround
    ? null
    : lab.turnaround.min === lab.turnaround.max
      ? td('marketplace.days', { count: lab.turnaround.min })
      : `${lab.turnaround.min}–${lab.turnaround.max} ${td('marketplace.daysUnit')}`;

  return (
    <Link
      component={RouterLink}
      to={PUBLIC_ROUTES.lab(lab.id)}
      underline="none"
      sx={[
        cardSx(tones.border),
        {
          color: 'text.primary',
          fontWeight: 400,
          transition: `border-color ${motion.slow}, box-shadow ${motion.slow}`,
          '&:hover': {
            color: 'text.primary',
            borderColor: alpha(palette2026.peri, 0.6),
            boxShadow: lift.card,
          },
          '&:focus-visible': { outline: `2px solid ${tones.accent}`, outlineOffset: '3px' },
        },
      ]}
    >
      <Stack direction="row" alignItems="center" sx={{ gap: '12px', minWidth: 0 }}>
        <LabAvatar lab={lab} />
        <Stack sx={{ gap: '2px', minWidth: 0 }}>
          <Typography
            component="h3"
            noWrap
            sx={{ fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.35 }}
          >
            {lab.public_name}
          </Typography>
          {lab.city && (
            <Typography noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
              {lab.city}
            </Typography>
          )}
        </Stack>
      </Stack>

      {lab.services.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: '6px', minWidth: 0 }}>
          {lab.services.map((s) => (
            <Box
              key={s.id}
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                maxWidth: '100%',
                height: 26,
                px: '9px',
                borderRadius: `${radii.chipSm}px`,
                bgcolor: tones.subtle,
                border: 1,
                borderColor: tones.border,
                fontSize: '0.75rem',
                fontWeight: 500,
                color: tones.chipText,
              }}
            >
              <Box
                component="span"
                sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {s.name}
              </Box>
              {/* Always "from": it is the lowest price the service lists,
                  whatever it is per (tooth, jaw, implant or order). */}
              <Box
                component="span"
                sx={{ flexShrink: 0, fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap' }}
              >
                {t('catalog.from', { price: formatGELShort(s.from.amount) })}
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      <Stack
        direction="row"
        alignItems="baseline"
        sx={{
          mt: 'auto',
          pt: '14px',
          gap: '12px',
          flexWrap: 'wrap',
          borderTop: 1,
          borderColor: 'divider',
          fontSize: '0.8125rem',
        }}
      >
        {turnaround && (
          <span>
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {t('catalog.turnaround')}
            </Box>{' '}
            <Box component="span" sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>
              {turnaround}
            </Box>
          </span>
        )}
        <Box component="span" sx={{ ml: 'auto', color: 'text.secondary' }}>
          {t('catalog.services', { count: lab.serviceCount })}
        </Box>
      </Stack>
    </Link>
  );
}

/** The lab's logo, or its initials on the chip surface. */
function LabAvatar({ lab }: { lab: LandingLab }) {
  const tones = useLandingTones();
  const sx = {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: `${radii.card}px`,
  } as const;
  if (lab.logo_url) {
    return (
      <Box
        component="img"
        src={lab.logo_url}
        alt=""
        loading="lazy"
        sx={{ ...sx, objectFit: 'cover', bgcolor: tones.chip }}
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
        bgcolor: tones.chip,
        color: tones.chipText,
        fontSize: '0.875rem',
        fontWeight: 700,
      }}
    >
      {initialsOf(lab.public_name)}
    </Box>
  );
}

function LabCardSkeleton() {
  const tones = useLandingTones();
  return (
    <Box aria-hidden sx={[cardSx(tones.border), { minHeight: 196 }]}>
      <Stack direction="row" alignItems="center" sx={{ gap: '12px' }}>
        <Skeleton variant="rounded" width={44} height={44} sx={{ borderRadius: `${radii.card}px` }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="60%" height={22} />
          <Skeleton width="30%" height={18} />
        </Box>
      </Stack>
      <Stack direction="row" sx={{ gap: '6px' }}>
        <Skeleton variant="rounded" width={120} height={26} />
        <Skeleton variant="rounded" width={110} height={26} />
      </Stack>
      <Skeleton width="45%" height={20} sx={{ mt: 'auto' }} />
    </Box>
  );
}

/** Dashed means "not yet" — the slot a lab can take by signing up. */
function YourLabCard({ sx }: { sx?: SxProps<Theme> }) {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  return (
    <Box
      sx={[
        {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '10px',
          minWidth: 0,
          p: '24px',
          border: '1px dashed',
          borderColor: tones.dashed,
          borderRadius: `${landingRadii.card}px`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography component="h3" sx={{ fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.35 }}>
        {t('catalog.yourLab.title')}
      </Typography>
      <Typography sx={{ fontSize: '0.8125rem', lineHeight: 1.6, color: 'text.secondary', maxWidth: 440 }}>
        {t('catalog.yourLab.body')}
      </Typography>
      <ArrowLink to="/register/lab" small>
        {t('catalog.yourLab.cta')}
      </ArrowLink>
    </Box>
  );
}
