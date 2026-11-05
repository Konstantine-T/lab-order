import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Button, Link, Stack, Typography, useTheme, type Theme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { LiveDot } from '@/features/catalog/labDesign';
import { pillActionSx, pillOutlineSx, pillSize, tiltSurfaceSx } from '@/features/catalog/labStyles';
import { useCardTilt } from '@/features/catalog/useCardTilt';
import { whatsappUrl } from '@/features/labs/whatsapp';
import { DARK, palette2026, radii, surfaces } from '@/theme/tokens';
import {
  amountText,
  featuredProfilePrice,
  labHasContact,
  labMaterials,
  mapsUrl,
  panelSx,
  rangeText,
  rushSummary,
  telHref,
  turnaroundRange,
  unitText,
} from './format';
import type { ProfileLab, ProfileService } from './useLabProfile';

/** What a pinned rail clears: the sticky tabs, plus a little air. */
const RAIL_TOP = 64;
/** Air kept under a rail taller than the window, once its end is reached. */
const RAIL_GUTTER = 24;
/** A description longer than this starts clamped, behind "Show more". */
const LONG_DESCRIPTION = 320;

const linkSx = {
  fontWeight: 600,
  color: (theme: Theme) =>
    theme.palette.mode === 'light' ? palette2026.periText : DARK.periLight,
} as const;

const cardSx = {
  ...panelSx,
  p: 2.5,
  display: 'flex',
  flexDirection: 'column',
  gap: 1.75,
} as const;

const titleSx = {
  fontSize: '1rem',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  lineHeight: 1.3,
  outline: 'none',
} as const;

/**
 * The right-hand column, pinned so it never scrolls away beside a long services
 * list. A rail taller than the window pins by its bottom edge instead of its top:
 * it scrolls with the page until its last card is in view and holds there, so
 * everything in it is reached by scrolling the page, with no scrollbar of its own.
 */
export function ProfileRail({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [top, setTop] = useState(RAIL_TOP);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () =>
      setTop(Math.min(RAIL_TOP, window.innerHeight - el.offsetHeight - RAIL_GUTTER));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <Stack
      ref={ref}
      spacing={2.25}
      sx={{ minWidth: 0, position: { lg: 'sticky' }, top: { lg: `${top}px` } }}
    >
      {children}
    </Stack>
  );
}

function FactRow({ icon, children }: { icon: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Stack direction="row" alignItems="center" spacing={1.125} sx={{ fontSize: '0.875rem', minWidth: 0 }}>
      <Icon name={icon} size={16} sx={{ color: surfaces[theme.palette.mode].textMuted, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Stack>
  );
}

/**
 * "Accepting orders", the price the lab leads with, its turnaround and rush, and
 * the actions. Every order starts from one of the lab's services, so "New order"
 * takes the doctor to the list rather than to a blank form. On a single column
 * the actions are at the top of the page already, so here they would only be a
 * way back up: only the facts stay.
 */
export function LabOrderCard({
  lab,
  services,
  onChooseService,
  disabled,
}: {
  lab: ProfileLab;
  services: ProfileService[];
  onChooseService: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const theme = useTheme();
  const tiltRef = useCardTilt<HTMLDivElement>(2);

  const featured = featuredProfilePrice(services);
  const range = turnaroundRange(services);
  const rush = rushSummary(services, tc);
  const wa = whatsappUrl(lab.contact_phone);
  const unit = featured ? unitText(featured.price, t) : undefined;
  const onWide = { display: { xs: 'none', lg: 'inline-flex' } } as const;

  return (
    <Box
      ref={tiltRef}
      aria-label={t('labProfile.orderCard.title')}
      role="region"
      sx={{ ...cardSx, position: 'relative', ...tiltSurfaceSx }}
    >
      {!disabled && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.secondary' }}
        >
          <LiveDot />
          <span>{t('labProfile.acceptingOrders')}</span>
        </Stack>
      )}

      {featured && (
        <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 0.75 }}>
          <Box component="span" sx={{ flexBasis: '100%', fontSize: '0.8125rem', color: 'text.secondary', overflowWrap: 'anywhere' }}>
            {featured.service.name}
          </Box>
          <Box
            component="b"
            sx={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25 }}
          >
            {amountText(featured.price, t)}
          </Box>
          {unit && (
            <Box component="span" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
              {unit}
            </Box>
          )}
        </Box>
      )}

      {(range || rush.offered) && (
        <Stack spacing={1.125}>
          {range && (
            <FactRow icon="schedule">{t('labProfile.turnaroundIs', { value: rangeText(range, t) })}</FactRow>
          )}
          {rush.offered && (
            <FactRow icon="bolt">
              {rush.surcharge ? t('labProfile.rushIs', { value: rush.surcharge }) : t('labProfile.rushAvailable')}
            </FactRow>
          )}
        </Stack>
      )}

      <Button
        variant="contained"
        fullWidth
        disabled={disabled}
        onClick={onChooseService}
        startIcon={<Icon name="send" size={19} />}
        sx={{ ...pillActionSx(theme.palette.mode), ...pillSize.lg, ...onWide }}
      >
        {t('labProfile.orderCard.cta')}
      </Button>
      {wa && (
        <Button
          component="a"
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          variant="outlined"
          fullWidth
          startIcon={<Icon name="chat_bubble" size={17} />}
          aria-label={t('labProfile.contact.whatsappA11y')}
          sx={{ ...pillOutlineSx, ...pillSize.md, ...onWide }}
        >
          {t('labProfile.message')}
        </Button>
      )}
      <Typography
        sx={{
          display: { xs: 'none', lg: 'block' },
          fontSize: '0.75rem',
          lineHeight: 1.5,
          textAlign: 'center',
          color: 'text.secondary',
        }}
      >
        {t('labProfile.orderCard.body')}
      </Typography>
    </Box>
  );
}

/**
 * "Works with": the materials the lab's published forms list, in the reader's
 * language. The mockup's files and equipment have no data behind them yet.
 * Renders nothing for a lab that lists no materials.
 */
export function LabWorksWithCard({ services }: { services: ProfileService[] }) {
  const { t } = useTranslation('doctor');
  const theme = useTheme();
  const s = surfaces[theme.palette.mode];
  const materials = labMaterials(services);
  if (materials.length === 0) return null;
  return (
    <Box sx={cardSx}>
      <Typography component="h2" sx={titleSx}>
        {t('labProfile.worksWith')}
      </Typography>
      <Box>
        <Typography
          sx={{
            fontSize: '0.71875rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: s.textMuted,
          }}
        >
          {t('labProfile.materials')}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
          {materials.map((m) => (
            <Box
              key={m.key}
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 28,
                px: 1.25,
                py: '3px',
                borderRadius: `${radii.chipSm}px`,
                bgcolor: s.chip,
                fontSize: '0.78125rem',
                fontWeight: 600,
                lineHeight: 1.35,
                overflowWrap: 'anywhere',
              }}
            >
              {m.label}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

/** "About the lab": its description, clamped when long so the rail keeps its other cards in reach. */
export function LabAboutCard({ description }: { description: string }) {
  const { t } = useTranslation('doctor');
  const [open, setOpen] = useState(false);
  const long = description.length > LONG_DESCRIPTION;
  const clamped = long && !open;
  return (
    <Box sx={cardSx}>
      <Typography component="h2" tabIndex={-1} sx={titleSx}>
        {t('labProfile.about')}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.875rem',
          lineHeight: 1.6,
          color: 'text.secondary',
          whiteSpace: 'pre-line',
          overflowWrap: 'anywhere',
          ...(clamped && {
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 8,
            overflow: 'hidden',
          }),
        }}
      >
        {description}
      </Typography>
      {clamped && (
        <Link
          component="button"
          type="button"
          underline="hover"
          onClick={() => setOpen(true)}
          sx={{ ...linkSx, alignSelf: 'flex-start', fontSize: '0.8125rem', mt: -0.75 }}
        >
          {t('reviews.showMore')}
        </Link>
      )}
    </Box>
  );
}

function ContactRow({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1.25}
      alignItems="flex-start"
      sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.5, minWidth: 0 }}
    >
      <Icon name={icon} size={16} sx={{ color: (theme) => surfaces[theme.palette.mode].textMuted, mt: '1px', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
    </Stack>
  );
}

/**
 * Phone (a `tel:` link, plus WhatsApp when the number makes one), email, and
 * the working address with a Google Maps search for it. Renders nothing when
 * the lab has published none of them.
 */
export function LabContactCard({ lab }: { lab: ProfileLab }) {
  const { t } = useTranslation('doctor');
  const phone = lab.contact_phone?.trim() || null;
  const email = lab.contact_email?.trim() || null;
  const address = lab.working_address?.trim() || null;
  const city = lab.city?.trim() || null;
  const tel = phone ? telHref(phone) : null;
  const wa = phone ? whatsappUrl(phone) : null;
  const map = mapsUrl(address, city);
  const place = [address, city].filter(Boolean).join(', ');

  if (!labHasContact(lab)) return null;

  return (
    <Box sx={{ ...cardSx, gap: 1.25 }}>
      <Typography component="h2" tabIndex={-1} sx={titleSx}>
        {t('labProfile.contact.title')}
      </Typography>

      {phone && (
        <ContactRow icon="call">
          {tel ? (
            <Link href={tel} color="inherit" underline="hover">
              {phone}
            </Link>
          ) : (
            phone
          )}
          {wa && (
            <>
              {' · '}
              {/* How these labs are actually reached: the chat, not the dial. */}
              <Link
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                aria-label={t('labProfile.contact.whatsappA11y')}
                sx={linkSx}
              >
                WhatsApp
              </Link>
            </>
          )}
        </ContactRow>
      )}

      {email && (
        <ContactRow icon="mail">
          <Link href={`mailto:${email}`} color="inherit" underline="hover">
            {email}
          </Link>
        </ContactRow>
      )}

      {place && (
        <ContactRow icon="location_on">
          {place}
          {map && (
            <>
              {' · '}
              <Link
                href={map}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                aria-label={t('labProfile.contact.mapA11y')}
                sx={linkSx}
              >
                {t('labProfile.contact.map')}
              </Link>
            </>
          )}
        </ContactRow>
      )}
    </Box>
  );
}
