import type { ReactNode } from 'react';
import { Box, Link, Stack, Typography } from '@mui/material';
import { Trans, useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/BrandMark';
import { Icon } from '@/components/design';
import { PUBLIC_ROUTES } from '@/features/public/publicRoutes';
import { LandingNav } from '@/features/public/landing/LandingNav';
import { HeroOrderCard } from '@/features/public/landing/HeroOrderCard';
import { LandingCatalog } from '@/features/public/landing/LandingCatalog';
import { Faq } from '@/features/public/landing/Faq';
import { LandingFooter } from '@/features/public/landing/LandingFooter';
import {
  Container,
  Eyebrow,
  LinkButton,
  SectionHead,
  SectionTitle,
} from '@/features/public/landing/primitives';
import {
  anchoredSx,
  CHAIN_SITES,
  CONTACT_EMAIL,
  landingRadii,
  listOf,
  useDocumentMeta,
  useLandingTones,
} from '@/features/public/landing/helpers';
import { palette2026, radii } from '@/theme/tokens';

type Step = { title: string; body: string };

/** Icons for the four "why" tiles, in the order of `why.items`. */
const WHY_ICONS = ['dentistry', 'sell', 'timeline', 'send'] as const;

/**
 * The dark theme's hairline around a mist surface, drawn inside the box
 * rather than as a border: a border would take 2px out of the text column,
 * and the design's tile titles ("სტატუსი რეალურ დროში") fit on one line with
 * none to spare.
 */
const edgeShadow = (edge: string) => (edge === 'transparent' ? 'none' : `inset 0 0 0 1px ${edge}`);

/**
 * The front door for anyone without a session — the 2026-09 redesign's
 * landing (`page01` desktop, `page02` phone), section for section: hero with
 * a live order card, the Dental Chain strip, three steps, why, the two
 * audiences, the catalogue teaser, FAQ, and the closing CTA with the footer.
 *
 * Every link goes somewhere real. "Send an order" and "Laboratories" go to
 * the guest catalogue, where a visitor can pick a lab and start an order
 * before having an account; registration and sign-in go to their pages;
 * section links scroll in place. What the design shows but the platform
 * doesn't have yet — ratings, case counts, a verified tick, "invite your
 * lab", legal pages — is left out rather than faked.
 */
export function LandingPage() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  useDocumentMeta(t('meta.title'), t('meta.description'));

  return (
    <Box
      sx={{
        bgcolor: tones.ground,
        color: 'text.primary',
        minHeight: '100vh',
        fontSize: '0.9375rem',
        lineHeight: 1.6,
        // A guard, not a layout tool: nothing here should be wider than the
        // viewport, but if a long word ever is, it must not scroll the page
        // sideways. `clip` (unlike `hidden`) keeps the nav's `sticky` working.
        overflowX: 'clip',
      }}
    >
      <LandingNav />
      <Box component="main">
        <Hero />
        <ChainStrip />
        <HowItWorks />
        <Why />
        <Audiences />
        <LandingCatalog />
        <FaqSection />
      </Box>
      <LandingFooter />
    </Box>
  );
}

function Hero() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();

  return (
    <Box component="section" sx={{ bgcolor: tones.subtle }}>
      <Container
        sx={{
          pt: { xs: '36px', sm: '56px', lg: '88px' },
          pb: { xs: '32px', sm: '56px', lg: '88px' },
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.2fr) minmax(0, 1fr)' },
          gap: { xs: '28px', sm: '40px', lg: '64px' },
          alignItems: 'center',
        }}
      >
        <Stack sx={{ gap: { xs: '16px', sm: '22px' }, maxWidth: { sm: 640, lg: 'none' }, minWidth: 0 }}>
          <Eyebrow>{t('hero.eyebrow')}</Eyebrow>
          <Typography
            component="h1"
            sx={{
              // The design's clamp(32px, 4.2vw, 48px), with a phone floor low
              // enough that "ლაბორატორიული" still fits a 320px screen.
              fontSize: { xs: 'clamp(1.75rem, 8.2vw, 3rem)', lg: '3rem' },
              lineHeight: 1.15,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              overflowWrap: 'break-word',
            }}
          >
            <Trans
              ns="landing"
              i18nKey="hero.title"
              components={{ accent: <Box component="span" sx={{ color: tones.accent }} /> }}
            />
          </Typography>
          <Typography
            sx={{
              maxWidth: 520,
              fontSize: { xs: '1rem', sm: '1.125rem' },
              lineHeight: 1.6,
              color: 'text.secondary',
              textWrap: 'pretty',
            }}
          >
            {t('hero.subtitle')}
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{ gap: { xs: '10px', sm: '12px' }, pt: '6px', flexWrap: 'wrap' }}
          >
            <LinkButton to={PUBLIC_ROUTES.marketplace} variant="primary" size="lg">
              {t('hero.primaryCta')}
            </LinkButton>
            <LinkButton to="/register/lab" variant="outlined" size="lg">
              {t('hero.secondaryCta')}
            </LinkButton>
          </Stack>
          {/* The design drops the language list on phones to keep this to one line. */}
          <Typography
            sx={{
              pt: '2px',
              fontSize: '0.8125rem',
              color: 'text.secondary',
              textAlign: { xs: 'center', sm: 'left' },
            }}
          >
            {t('hero.trust')}
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              {` · ${t('hero.languages')}`}
            </Box>
          </Typography>
        </Stack>

        <Box sx={{ minWidth: 0, width: '100%', maxWidth: { sm: 600, lg: 'none' } }}>
          <HeroOrderCard />
        </Box>
      </Container>
    </Box>
  );
}

/**
 * "Part of Dental Chain": the sister sites, then this one. There are no logo
 * files for DentalMall.ge and DentalCourse.ge in the app, so each gets a
 * neutral glyph in the muted colour instead of an invented mark. On phones
 * the label takes its own line and the grey descriptions drop, as the
 * design's phone frame does.
 */
function ChainStrip() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();

  return (
    <Box
      component="section"
      aria-label="Dental Chain"
      sx={{ bgcolor: tones.ground, borderTop: 1, borderBottom: 1, borderColor: 'divider' }}
    >
      <Container
        sx={{
          py: { xs: '16px', sm: '22px' },
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          columnGap: { xs: '20px', md: '36px' },
          rowGap: { xs: '10px', sm: '12px' },
        }}
      >
        <Typography
          sx={{
            flexBasis: { xs: '100%', sm: 'auto' },
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.02em',
            color: 'text.secondary',
          }}
        >
          {t('chain.label')}
        </Typography>
        <ChainItem
          href={CHAIN_SITES.mall.href}
          mark={<Icon name="storefront" size={22} sx={{ color: tones.muted }} />}
          name={CHAIN_SITES.mall.name}
          note={t('chain.mall')}
        />
        <ChainItem
          href={CHAIN_SITES.course.href}
          mark={<Icon name="stylus_note" size={22} sx={{ color: tones.muted }} />}
          name={CHAIN_SITES.course.name}
          note={t('chain.course')}
        />
        {/* This site: named, not linked. */}
        <ChainItem mark={<BrandMark size={22} />} name="Dentallabs.ge" note={t('chain.labs')} />
      </Container>
    </Box>
  );
}

function ChainItem({
  href,
  mark,
  name,
  note,
}: {
  href?: string;
  mark: ReactNode;
  name: string;
  note: string;
}) {
  const tones = useLandingTones();
  const body = (
    <>
      {mark}
      <span>{name}</span>
      <Box
        component="span"
        sx={{ display: { xs: 'none', sm: 'inline' }, ml: '4px', fontWeight: 500, color: tones.muted }}
      >
        {note}
      </Box>
    </>
  );
  const sx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'text.primary',
    whiteSpace: 'nowrap',
  } as const;

  if (!href) return <Box sx={sx}>{body}</Box>;
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      underline="none"
      sx={{ ...sx, '&:hover': { color: tones.accent } }}
    >
      {body}
    </Link>
  );
}

function HowItWorks() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  const steps = listOf<Step>(t('how.steps', { returnObjects: true }));

  return (
    <Box component="section" id="how" sx={anchoredSx}>
      <Container
        sx={{
          pt: { xs: '40px', sm: '72px', lg: '96px' },
          pb: { xs: '16px', sm: '64px', lg: '80px' },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: '20px', sm: '44px' },
        }}
      >
        <SectionHead eyebrow={t('how.eyebrow')} title={t('how.title')} />
        {/* Desktop: three columns under a heavy ink rule. Phones and small
            tablets: a numbered list with hairlines between the rows. */}
        <Box
          component="ol"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
            gap: { xs: 0, md: '32px', lg: '40px' },
          }}
        >
          {steps.map((s, i) => (
            <Box
              component="li"
              key={s.title}
              sx={{
                display: 'flex',
                flexDirection: { xs: 'row', md: 'column' },
                gap: { xs: '16px', md: '14px' },
                py: { xs: '16px', md: 0 },
                pt: { md: '22px' },
                borderTop: { xs: '1px solid', md: '2px solid' },
                borderColor: { xs: 'divider', md: 'text.primary' },
                minWidth: 0,
              }}
            >
              <Typography
                aria-hidden
                sx={{
                  width: { xs: 24, md: 'auto' },
                  flexShrink: 0,
                  pt: { xs: '2px', md: 0 },
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: tones.accent,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </Typography>
              <Stack sx={{ gap: { xs: '4px', md: '6px' }, minWidth: 0 }}>
                <Typography
                  component="h3"
                  sx={{
                    fontSize: { xs: '1rem', md: 'clamp(1.125rem, 1.8vw, 1.25rem)' },
                    fontWeight: { xs: 600, md: 700 },
                    lineHeight: 1.3,
                  }}
                >
                  {s.title}
                </Typography>
                <Typography
                  sx={{ fontSize: { xs: '0.8125rem', md: '0.9375rem' }, lineHeight: 1.6, color: 'text.secondary' }}
                >
                  {s.body}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}

function Why() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  const items = listOf<Step>(t('why.items', { returnObjects: true }));

  return (
    <Box component="section">
      <Container
        sx={{
          pb: { xs: '24px', sm: '80px', lg: '96px' },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: '16px', sm: '36px' },
        }}
      >
        <SectionHead eyebrow={t('why.eyebrow')} title={t('why.title')} />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              sm: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(4, minmax(0, 1fr))',
            },
            gap: { xs: '10px', sm: '20px' },
          }}
        >
          {items.map((it, i) => (
            <Box
              key={it.title}
              sx={{
                display: 'flex',
                flexDirection: { xs: 'row', sm: 'column' },
                alignItems: 'flex-start',
                gap: '14px',
                minWidth: 0,
                p: { xs: '16px', sm: '26px 24px' },
                bgcolor: tones.subtle,
                boxShadow: edgeShadow(tones.subtleEdge),
                borderRadius: `${landingRadii.card}px`,
              }}
            >
              <Box
                sx={{
                  width: { xs: 38, sm: 44 },
                  height: { xs: 38, sm: 44 },
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: `${radii.card}px`,
                  bgcolor: tones.done.bg,
                  color: tones.done.fg,
                }}
              >
                <Icon name={WHY_ICONS[i] ?? 'check'} size={22} />
              </Box>
              <Stack sx={{ gap: '4px', minWidth: 0 }}>
                <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.35 }}>
                  {it.title}
                </Typography>
                <Typography
                  sx={{ fontSize: { xs: '0.8125rem', sm: '0.875rem' }, lineHeight: 1.5, color: 'text.secondary' }}
                >
                  {it.body}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}

/** For doctors (mist) and for labs (ink), side by side; stacked below `md`. */
function Audiences() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  const doctorItems = listOf<string>(t('doctors.items', { returnObjects: true }));
  const labItems = listOf<string>(t('labs.items', { returnObjects: true }));

  return (
    <Box component="section">
      <Container
        sx={{
          // The design's phone frame runs 12px here, which glues the catalogue's
          // eyebrow to the ink card; a little more air reads as a new section.
          pb: { xs: '32px', sm: '80px', lg: '96px' },
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
          gap: { xs: '12px', sm: '24px' },
        }}
      >
        <Panel id="doctors" bg={tones.subtle} edge={tones.subtleEdge}>
          <Eyebrow>{t('doctors.eyebrow')}</Eyebrow>
          <PanelTitle>{t('doctors.title')}</PanelTitle>
          <Stack component="ul" sx={{ m: 0, p: 0, listStyle: 'none', gap: '12px' }}>
            {doctorItems.map((line) => (
              <PanelItem
                key={line}
                marker={
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      mt: '3px',
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '50%',
                      bgcolor: tones.done.bg,
                      color: tones.done.fg,
                    }}
                  >
                    <Icon name="check" size={14} />
                  </Box>
                }
              >
                {line}
              </PanelItem>
            ))}
          </Stack>
          <PanelActions>
            <LinkButton to="/register/doctor" variant="ink">
              {t('doctors.ctaDoctor')}
            </LinkButton>
            <LinkButton to="/register/clinic" variant="outlined">
              {t('doctors.ctaClinic')}
            </LinkButton>
          </PanelActions>
        </Panel>

        <Panel
          id="labs"
          bg={tones.ink}
          edge={tones.mode === 'dark' ? tones.inkLine : 'transparent'}
          color="#fff"
        >
          <Eyebrow color={palette2026.aqua}>{t('labs.eyebrow')}</Eyebrow>
          <PanelTitle color="#fff">{t('labs.title')}</PanelTitle>
          <Stack component="ul" sx={{ m: 0, p: 0, listStyle: 'none', gap: '12px', color: tones.inkText }}>
            {labItems.map((line) => (
              <PanelItem
                key={line}
                marker={
                  <Box component="span" aria-hidden sx={{ color: palette2026.aqua, flexShrink: 0 }}>
                    —
                  </Box>
                }
              >
                {line}
              </PanelItem>
            ))}
          </Stack>
          <PanelActions>
            <LinkButton to="/register/lab" variant="white">
              {t('labs.cta')}
            </LinkButton>
            <Typography
              sx={{ fontSize: '0.8125rem', color: tones.inkText, textAlign: { xs: 'center', sm: 'left' } }}
            >
              {t('labs.concierge')}
            </Typography>
          </PanelActions>
        </Panel>
      </Container>
    </Box>
  );
}

function Panel({
  id,
  bg,
  edge,
  color,
  children,
}: {
  id: string;
  bg: string;
  edge: string;
  color?: string;
  children: ReactNode;
}) {
  return (
    <Box
      id={id}
      sx={{
        ...anchoredSx,
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: '12px', sm: '20px' },
        minWidth: 0,
        p: { xs: '24px', sm: '40px' },
        bgcolor: bg,
        color,
        boxShadow: edgeShadow(edge),
        borderRadius: { xs: `${landingRadii.card}px`, sm: `${landingRadii.panel}px` },
      }}
    >
      {children}
    </Box>
  );
}

function PanelTitle({ children, color }: { children: string; color?: string }) {
  return (
    <SectionTitle color={color} sx={{ fontSize: { xs: '1.25rem', sm: 'clamp(1.375rem, 2.2vw, 1.625rem)' } }}>
      {children}
    </SectionTitle>
  );
}

function PanelItem({ marker, children }: { marker: ReactNode; children: string }) {
  return (
    <Box
      component="li"
      sx={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: { xs: '0.875rem', sm: '0.9375rem' } }}
    >
      {marker}
      <span>{children}</span>
    </Box>
  );
}

function PanelActions({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        flexWrap: 'wrap',
        gap: { xs: '10px', sm: '12px' },
        pt: '8px',
      }}
    >
      {children}
    </Box>
  );
}

function FaqSection() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();

  return (
    <Box component="section" id="faq" sx={anchoredSx}>
      <Container
        sx={{
          pb: { xs: '48px', sm: '88px', lg: '104px' },
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 380px) minmax(0, 1fr)' },
          gap: { xs: '16px', sm: '32px', md: '64px' },
          alignItems: 'start',
        }}
      >
        <Stack sx={{ gap: '12px', minWidth: 0 }}>
          <Eyebrow>{t('faq.eyebrow')}</Eyebrow>
          <SectionTitle>{t('faq.title')}</SectionTitle>
          <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary' }}>
            {`${t('faq.more')} `}
            <Link
              href={`mailto:${CONTACT_EMAIL}`}
              underline="hover"
              sx={{ color: tones.accent, fontWeight: 600, overflowWrap: 'anywhere' }}
            >
              {CONTACT_EMAIL}
            </Link>
          </Typography>
        </Stack>
        <Faq />
      </Container>
    </Box>
  );
}
