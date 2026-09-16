import { alpha, Box, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { PUBLIC_ROUTES } from '@/features/public/publicRoutes';
import { LandingNav } from '@/features/public/landing/LandingNav';
import { FlowCard } from '@/features/public/landing/FlowCard';
import { Faq } from '@/features/public/landing/Faq';
import {
  OrderSheetMock,
  OrdersListMock,
  ScreenFrame,
} from '@/features/public/landing/ScreenMocks';
import {
  BrandPill,
  CheckLine,
  Container,
  Eyebrow,
  FeatureRow,
  Lede,
  LinkButton,
  SectionTitle,
} from '@/features/public/landing/primitives';
import { NAV_HEIGHT, scrollToAnchor, useLandingTones } from '@/features/public/landing/helpers';
import { brand, radii } from '@/theme/tokens';

/**
 * The front door for anyone without a session — a port of the Claude Design
 * page in `design/Landing Page.dc.html`, section for section.
 *
 * Every link goes somewhere real: registration and sign-in to their pages,
 * "Laboratories" and "Make an order" to the guest catalogue (the design
 * pointed them at the doctor's marketplace, which needs a session this
 * visitor does not have), section links to in-page anchors, contact to the
 * mailbox the design names. The two "screenshot" slots hold live-built
 * screens rather than images — see `ScreenMocks`.
 */
export function LandingPage() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  const year = new Date().getFullYear();

  type Step = { title: string; body: string };
  const steps = t('how.steps', { returnObjects: true }) as Step[];
  const doctorFeatures = t('doctors.features', { returnObjects: true }) as Step[];
  const labFeatures = t('labs.features', { returnObjects: true }) as Step[];
  const before = t('problem.before.items', { returnObjects: true }) as string[];
  const after = t('problem.after.items', { returnObjects: true }) as string[];

  const DOCTOR_ICONS = ['grid_on', 'payments', 'history', 'edit_note', 'receipt_long'];
  const LAB_ICONS = ['dashboard_customize', 'sell', 'inbox', 'groups', 'account_balance_wallet'];

  // Anchored sections clear the sticky nav when jumped to.
  const anchored = { scrollMarginTop: NAV_HEIGHT + 8 };

  return (
    <Box sx={{ bgcolor: 'background.default', color: 'text.primary', minHeight: '100vh' }}>
      {/* ---- Hero: nav rides inside the wash so the tint starts at the top ---- */}
      <Box
        sx={{
          position: 'relative',
          background: `radial-gradient(900px 420px at 50% -80px, ${alpha(brand.main, 0.18)}, transparent 70%)`,
        }}
      >
        <LandingNav />

        <Container
          sx={{
            pt: { xs: 5, md: 9 },
            pb: 7,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2.5,
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 28,
              px: 1.625,
              borderRadius: `${radii.pill}px`,
              bgcolor: tones.brandTint.bg,
              border: 1,
              borderColor: tones.brandTint.border,
              color: tones.brandTint.fg,
              fontSize: '0.71875rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {t('hero.eyebrow')}
          </Box>
          <Typography
            variant="h1"
            component="h1"
            sx={{
              fontSize: { xs: '2.125rem', sm: '2.75rem', md: '3.25rem' },
              lineHeight: 1.08,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              maxWidth: 800,
              textWrap: 'pretty',
            }}
          >
            {t('hero.title')}
          </Typography>
          <Typography
            sx={{
              maxWidth: 640,
              fontSize: { xs: '1rem', md: '1.125rem' },
              lineHeight: 1.6,
              color: 'text.secondary',
              textWrap: 'pretty',
            }}
          >
            {t('hero.subtitle')}
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{ mt: 1, width: { xs: '100%', sm: 'auto' } }}
          >
            <LinkButton to="/register/doctor" size="lg">
              {t('hero.primaryCta')}
            </LinkButton>
            <LinkButton to="/register/lab" variant="outlined" size="lg">
              {t('hero.secondaryCta')}
            </LinkButton>
          </Stack>
          <Stack direction="row" justifyContent="center" sx={{ flexWrap: 'wrap', gap: { xs: 1.25, sm: 2.5 }, mt: 0.75 }}>
            <CheckLine>{t('hero.checks.free')}</CheckLine>
            <CheckLine>{t('hero.checks.noSetup')}</CheckLine>
            <CheckLine>{t('hero.checks.languages')}</CheckLine>
          </Stack>

          <FlowCard />
        </Container>
      </Box>

      {/* ---- Band: straight to the catalogue ---- */}
      <Box sx={{ bgcolor: brand.strong, color: '#fff' }}>
        <Container>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ py: 4.25, gap: 4, flexWrap: 'wrap' }}
          >
            <Stack direction="row" alignItems="center" spacing={2}>
              <Icon name="science" size={32} sx={{ color: '#fff' }} />
              <Box>
                <Typography sx={{ fontSize: '1.3125rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {t('band.title')}
                </Typography>
                <Typography sx={{ fontSize: '0.90625rem', lineHeight: 1.55, color: alpha('#fff', 0.86), mt: 0.375 }}>
                  {t('band.body')}
                </Typography>
              </Box>
            </Stack>
            <LinkButton to={PUBLIC_ROUTES.marketplace} variant="onBand" size="lg" endIcon="arrow_forward">
              {t('band.cta')}
            </LinkButton>
          </Stack>
        </Container>
      </Box>

      {/* ---- Benefits + the problem ---- */}
      <Box sx={{ bgcolor: 'background.paper', borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Container>
          <Box
            sx={{
              pt: { xs: 5, md: 6.5 },
              pb: { xs: 5, md: 5.75 },
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
              gap: { xs: 3.5, md: 4.5 },
            }}
          >
            {(
              [
                ['verified', 'remakes'],
                ['schedule', 'minutes'],
                ['payments', 'money'],
              ] as const
            ).map(([icon, key]) => (
              <Stack key={key} spacing={1.125}>
                <Icon name={icon} size={26} sx={{ color: brand.link }} />
                <Typography sx={{ fontSize: '1.125rem', fontWeight: 800, letterSpacing: '-0.015em' }}>
                  {t(`benefits.${key}.title`)}
                </Typography>
                <Lede size="0.9375rem">{t(`benefits.${key}.body`)}</Lede>
              </Stack>
            ))}
          </Box>

          <Box sx={{ pb: 7.5 }}>
            <Stack alignItems="center" spacing={1.5} sx={{ pt: 5.75, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
              <Eyebrow>{t('problem.eyebrow')}</Eyebrow>
              <SectionTitle maxWidth={680} align="center">
                {t('problem.title')}
              </SectionTitle>
              <Lede maxWidth={620} align="center">
                {t('problem.body')}
              </Lede>
            </Stack>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                gap: 2.5,
                mt: 4.25,
              }}
            >
              <CompareCard
                icon="phone_in_talk"
                title={t('problem.before.title')}
                items={before}
                itemIcon="close"
                color={tones.danger.fg}
                bg={tones.danger.bg}
                border={tones.danger.border}
              />
              <CompareCard
                icon="task_alt"
                title={t('problem.after.title')}
                items={after}
                itemIcon="check"
                color={tones.brandTint.fg}
                bg={tones.brandTint.bg}
                border={tones.brandTint.border}
              />
            </Box>
          </Box>
        </Container>
      </Box>

      {/* ---- How it works ---- */}
      <Box id="how" sx={anchored}>
        <Container sx={{ py: 8 }}>
          <Stack spacing={1.375} sx={{ mb: 4.25, maxWidth: 660 }}>
            <Eyebrow>{t('how.eyebrow')}</Eyebrow>
            <SectionTitle>{t('how.title')}</SectionTitle>
            <Lede>{t('how.body')}</Lede>
          </Stack>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            {steps.map((s, i) => (
              <Stack
                key={s.title}
                spacing={1.25}
                sx={{
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: `${radii.card}px`,
                  p: 2.75,
                }}
              >
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    bgcolor: tones.brandTint.bg,
                    border: 1,
                    borderColor: tones.brandTint.border,
                    color: tones.brandTint.fg,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '0.84375rem',
                    fontWeight: 800,
                  }}
                >
                  {i + 1}
                </Box>
                <Typography sx={{ fontSize: '1.0625rem', fontWeight: 800, letterSpacing: '-0.015em' }}>
                  {s.title}
                </Typography>
                <Typography sx={{ fontSize: '0.90625rem', lineHeight: 1.65, color: 'text.secondary' }}>
                  {s.body}
                </Typography>
              </Stack>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ---- For doctors & clinics ---- */}
      <Box id="doctors" sx={{ ...anchored, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
        <Container
          sx={{
            py: 8,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
            gap: { xs: 4, md: 7 },
            alignItems: 'center',
          }}
        >
          <Stack spacing={2.25}>
            <BrandPill icon="stethoscope">{t('doctors.pill')}</BrandPill>
            <SectionTitle>{t('doctors.title')}</SectionTitle>
            <Stack spacing={2.25}>
              {doctorFeatures.map((f, i) => (
                <FeatureRow key={f.title} icon={DOCTOR_ICONS[i]} title={f.title} body={f.body} />
              ))}
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 0.5 }}>
              <LinkButton to="/register/doctor">{t('doctors.ctaDoctor')}</LinkButton>
              <LinkButton to="/register/clinic" variant="outlined">
                {t('doctors.ctaClinic')}
              </LinkButton>
            </Stack>
          </Stack>
          <ScreenFrame>
            <OrdersListMock />
          </ScreenFrame>
        </Container>
      </Box>

      {/* ---- For laboratories ---- */}
      <Box id="labs" sx={{ ...anchored, borderTop: 1, borderColor: 'divider' }}>
        <Container
          sx={{
            py: 8,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
            gap: { xs: 4, md: 7 },
            alignItems: 'center',
          }}
        >
          {/* The design leads with the screen on desktop; on a phone the
              words come first, so the screen reads as illustration and not
              as the section itself. */}
          <Box sx={{ order: { xs: 2, md: 0 } }}>
            <ScreenFrame>
              <OrderSheetMock />
            </ScreenFrame>
          </Box>
          <Stack spacing={2.25}>
            <BrandPill icon="science">{t('labs.pill')}</BrandPill>
            <SectionTitle>{t('labs.title')}</SectionTitle>
            <Stack spacing={2.25}>
              {labFeatures.map((f, i) => (
                <FeatureRow key={f.title} icon={LAB_ICONS[i]} title={f.title} body={f.body} />
              ))}
            </Stack>
            <Stack direction="row" sx={{ mt: 0.5 }}>
              <LinkButton to="/register/lab">{t('labs.cta')}</LinkButton>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* ---- FAQ ---- */}
      <Box id="faq" sx={{ ...anchored, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
        <Container maxWidth={820} sx={{ py: 8 }}>
          <SectionTitle sx={{ mb: 3 }}>{t('faq.title')}</SectionTitle>
          <Faq />
        </Container>
      </Box>

      {/* ---- Closing CTA + footer ---- */}
      <Box sx={{ bgcolor: tones.ink, color: tones.inkText }}>
        <Container>
          <Stack alignItems="center" spacing={2} sx={{ py: 8, textAlign: 'center' }}>
            <SectionTitle maxWidth={620} align="center" color={tones.inkText} sx={{ lineHeight: 1.15 }}>
              {t('cta.title')}
            </SectionTitle>
            <Lede maxWidth={540} align="center" color={tones.inkMuted} size="1rem">
              {t('cta.body')}
            </Lede>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ mt: 0.75, width: { xs: '100%', sm: 'auto' } }}
            >
              <LinkButton to="/register/doctor" variant="soft" size="lg">
                {t('cta.doctor')}
              </LinkButton>
              <LinkButton to="/register/lab" variant="ghostDark" size="lg">
                {t('cta.lab')}
              </LinkButton>
            </Stack>
            <Stack direction="row" justifyContent="center" sx={{ flexWrap: 'wrap', gap: { xs: 1.25, sm: 2.5 }, mt: 0.25 }}>
              <CheckLine color={tones.inkMuted} iconColor={brand.soft}>{t('cta.checks.free')}</CheckLine>
              <CheckLine color={tones.inkMuted} iconColor={brand.soft}>{t('cta.checks.noSetup')}</CheckLine>
              <CheckLine color={tones.inkMuted} iconColor={brand.soft}>{t('cta.checks.leave')}</CheckLine>
            </Stack>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems="center"
              justifyContent="space-between"
              spacing={1.5}
              sx={{
                width: '100%',
                mt: 3.25,
                pt: 2.75,
                borderTop: 1,
                borderColor: 'rgba(255,255,255,0.09)',
                fontSize: '0.78125rem',
                color: tones.inkMuted,
              }}
            >
              <span>{t('footer.copyright', { year })}</span>
              <Stack direction="row" spacing={2.25}>
                <FooterLink to="/login">{t('footer.signIn')}</FooterLink>
                <FooterLink to="#faq">{t('footer.faq')}</FooterLink>
                <FooterLink to="mailto:hello@dentallabs.ge">{t('footer.contact')}</FooterLink>
              </Stack>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}

/** "Phone & paper today" vs "With Dental Labs": a tinted card of four lines. */
function CompareCard({
  icon,
  title,
  items,
  itemIcon,
  color,
  bg,
  border,
}: {
  icon: string;
  title: string;
  items: string[];
  itemIcon: string;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <Stack
      spacing={2}
      sx={{ bgcolor: bg, border: 1, borderColor: border, borderRadius: `${radii.card}px`, p: '26px 26px 22px' }}
    >
      <Stack direction="row" alignItems="center" spacing={1.125}>
        <Icon name={icon} size={21} sx={{ color }} />
        <Typography sx={{ fontSize: '1.0625rem', fontWeight: 800, letterSpacing: '-0.015em' }}>
          {title}
        </Typography>
      </Stack>
      <Stack spacing={1.5}>
        {items.map((line) => (
          <Stack key={line} direction="row" spacing={1.25} alignItems="flex-start">
            <Icon name={itemIcon} size={19} sx={{ color, mt: 0.25 }} />
            <Typography sx={{ fontSize: '0.9375rem', lineHeight: 1.55 }}>{line}</Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

function FooterLink({ to, children }: { to: string; children: string }) {
  const tones = useLandingTones();
  const sx = { color: tones.inkMuted, '&:hover': { color: tones.inkText } } as const;
  if (to.startsWith('#')) {
    return (
      <Link href={to} onClick={scrollToAnchor} underline="none" sx={sx}>
        {children}
      </Link>
    );
  }
  if (to.startsWith('mailto:')) {
    return (
      <Link href={to} underline="none" sx={sx}>
        {children}
      </Link>
    );
  }
  return (
    <Link component={RouterLink} to={to} underline="none" sx={sx}>
      {children}
    </Link>
  );
}
