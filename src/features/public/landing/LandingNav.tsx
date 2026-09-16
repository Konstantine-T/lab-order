import { alpha, Box, Link, Stack, Typography, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/BrandMark';
import { ColorModeToggle } from '@/components/ColorModeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PUBLIC_ROUTES } from '@/features/public/publicRoutes';
import { Container, LinkButton } from './primitives';
import { NAV_HEIGHT, scrollToAnchor } from './helpers';

/**
 * The landing page's sticky top bar: brand, section anchors, and the two
 * account actions.
 *
 * "Laboratories" goes to the public marketplace rather than the design's
 * `/doctor/marketplace`: this page is only ever shown to someone without a
 * session, and the guest catalogue is where they can actually browse — and
 * start an order — before they have an account. A signed-in doctor who lands
 * on `/labs` is bounced to their own marketplace anyway.
 *
 * The theme and language switches are not in the design, which was drawn in
 * English and light mode only; they sit between the anchors and the account
 * buttons, where the app's other public pages keep them.
 */
export function LandingNav() {
  const { t } = useTranslation('landing');
  const theme = useTheme();

  const anchor = (id: string, label: string) => (
    <Link
      key={id}
      href={`#${id}`}
      onClick={scrollToAnchor}
      underline="none"
      sx={{
        fontSize: '0.875rem',
        fontWeight: 600,
        color: 'text.secondary',
        whiteSpace: 'nowrap',
        '&:hover': { color: 'text.primary' },
      }}
    >
      {label}
    </Link>
  );

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        bgcolor: alpha(theme.palette.background.paper, 0.9),
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Container>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={2}
          sx={{ height: NAV_HEIGHT }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.25}
            component={RouterLink}
            to={PUBLIC_ROUTES.landing}
            sx={{ color: 'text.primary', textDecoration: 'none', flexShrink: 0 }}
          >
            <BrandMark />
            <Typography sx={{ fontSize: '1.0625rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Dental Labs
            </Typography>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={{ xs: 1, lg: 2.75 }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={2.75}
              sx={{ display: { xs: 'none', lg: 'flex' } }}
            >
              <Link
                component={RouterLink}
                to={PUBLIC_ROUTES.marketplace}
                underline="none"
                sx={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'text.secondary',
                  '&:hover': { color: 'text.primary' },
                }}
              >
                {t('nav.labs')}
              </Link>
              {anchor('how', t('nav.how'))}
              {anchor('doctors', t('nav.doctors'))}
              {anchor('labs', t('nav.labsSection'))}
              {anchor('faq', t('nav.faq'))}
            </Stack>

            <Stack direction="row" alignItems="center" spacing={{ xs: 0.25, sm: 1 }}>
              <ColorModeToggle />
              <LanguageSwitcher variant="icon" />
              <LinkButton to="/login" variant="outlined" size="sm" sx={{ ml: { xs: 0.25, sm: 0.5 } }}>
                {t('nav.signIn')}
              </LinkButton>
              <LinkButton
                to="/register/doctor"
                variant="primary"
                size="sm"
                sx={{ display: { xs: 'none', sm: 'inline-flex' }, padding: '10px 18px' }}
              >
                {t('nav.getStarted')}
              </LinkButton>
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
