import type { ReactNode } from 'react';
import { Box, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandWordmark } from '@/components/BrandMark';
import { PUBLIC_ROUTES } from '@/features/public/publicRoutes';
import { radii } from '@/theme/tokens';
import { Container, LinkButton } from './primitives';
import {
  CHAIN_SITES,
  CONTACT_EMAIL,
  scrollToAnchor,
  scrollToTop,
  useLandingTones,
} from './helpers';

/**
 * The closing call to action and the footer, one ink band — ink in both
 * themes, as a brand surface.
 *
 * The design's footer has a fourth, "legal" column (terms, privacy). Those
 * pages don't exist yet, so the column is left out rather than linking to
 * nothing; the grid keeps the design's four tracks so the other columns sit
 * where it puts them.
 */
export function LandingFooter() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  const year = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: tones.ink,
        color: '#fff',
        // On the dark theme the ground is darker than ink; a hairline keeps
        // the band's top edge crisp.
        borderTop: tones.mode === 'dark' ? `1px solid ${tones.inkLine}` : 0,
      }}
    >
      <Container
        sx={{
          pt: { xs: '48px', sm: '64px', lg: '80px' },
          pb: { xs: '32px', sm: '40px' },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: '40px', sm: '64px' },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: 'space-between',
            gap: { xs: '24px', md: '40px' },
          }}
        >
          <Stack sx={{ gap: '10px', maxWidth: 560, minWidth: 0 }}>
            <Typography
              component="h2"
              sx={{
                fontSize: { xs: '1.625rem', sm: 'clamp(1.75rem, 3vw, 2.25rem)' },
                lineHeight: 1.15,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#fff',
                textWrap: 'balance',
              }}
            >
              {t('cta.title')}
            </Typography>
            <Typography sx={{ fontSize: { xs: '0.9375rem', sm: '1rem' }, color: tones.inkText }}>
              {t('cta.body')}
            </Typography>
          </Stack>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{ gap: '12px', flexShrink: 0, flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}
          >
            <LinkButton to={PUBLIC_ROUTES.marketplace} variant="primary" sx={{ minHeight: 52 }}>
              {t('cta.primary')}
            </LinkButton>
            <LinkButton to="/register/lab" variant="white" sx={{ minHeight: 52 }}>
              {t('cta.secondary')}
            </LinkButton>
          </Stack>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: '1.6fr 1fr 1fr 1fr' },
            gap: { xs: '28px 20px', md: '32px' },
            pt: { xs: '32px', md: '40px' },
            borderTop: 1,
            borderColor: tones.inkLine,
          }}
        >
          <Stack sx={{ gap: '10px', gridColumn: { xs: '1 / -1', md: 'auto' }, minWidth: 0 }}>
            {/* The wordmark on a small white plate, so its periwinkle and aqua
                keep their contrast against the ink. */}
            <Link
              component={RouterLink}
              to={PUBLIC_ROUTES.landing}
              onClick={scrollToTop}
              aria-label="Dentallabs.ge"
              underline="none"
              sx={{
                alignSelf: 'flex-start',
                mb: '4px',
                p: '8px 12px',
                bgcolor: '#fff',
                borderRadius: `${radii.tile}px`,
              }}
            >
              <BrandWordmark size={28} />
            </Link>
            <Typography sx={{ fontSize: '0.8125rem', lineHeight: 1.6, color: tones.inkText, maxWidth: 320 }}>
              {t('footer.tagline')}
              <br />
              {t('footer.chainPart')}
            </Typography>
            <FooterLink to={`mailto:${CONTACT_EMAIL}`} small>
              {CONTACT_EMAIL}
            </FooterLink>
          </Stack>

          <FooterColumn title={t('footer.platform')}>
            <FooterLink to={PUBLIC_ROUTES.marketplace}>{t('footer.labs')}</FooterLink>
            <FooterLink to="#how">{t('footer.how')}</FooterLink>
            <FooterLink to="#faq">{t('footer.faq')}</FooterLink>
            <FooterLink to="/login">{t('footer.signIn')}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t('footer.chain')}>
            <FooterLink to={CHAIN_SITES.mall.href}>{CHAIN_SITES.mall.name}</FooterLink>
            <FooterLink to={CHAIN_SITES.course.href}>{CHAIN_SITES.course.name}</FooterLink>
          </FooterColumn>
        </Box>

        <Typography sx={{ fontSize: '0.8125rem', color: tones.inkMuted }}>
          {t('footer.copyright', { year })}
        </Typography>
      </Container>
    </Box>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack sx={{ gap: '10px', minWidth: 0, fontSize: '0.875rem' }}>
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#fff' }}>
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

/** A footer link: in-page anchor, mailbox, another site (new tab) or a route. */
function FooterLink({ to, children, small }: { to: string; children: string; small?: boolean }) {
  const tones = useLandingTones();
  const sx = {
    alignSelf: 'flex-start',
    fontSize: small ? '0.8125rem' : '0.875rem',
    fontWeight: 400,
    color: tones.inkText,
    '&:hover': { color: '#fff' },
  } as const;
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
  if (/^https?:\/\//.test(to)) {
    return (
      <Link href={to} target="_blank" rel="noopener noreferrer" underline="none" sx={sx}>
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
