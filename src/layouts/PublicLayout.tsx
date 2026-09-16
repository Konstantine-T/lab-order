import { alpha, Box, Button, Stack, Typography, useTheme } from '@mui/material';
import type { PropsWithChildren } from 'react';
import { Link as RouterLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ColorModeToggle } from '@/components/ColorModeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { BrandMark } from '@/components/BrandMark';
import { PUBLIC_ROUTES } from '@/features/public/publicRoutes';
import { layout } from '@/theme/tokens';

/**
 * The logged-out chrome for the public catalogue: the marketplace, a lab's
 * profile and the guest order wizard. (The landing page has its own, taller
 * chrome — see `features/public/landing`.)
 *
 * Same top bar as `PublicAuthLayout`, then the same content column as
 * `AppShell` — width, gutters, top padding — so the marketplace and the wizard
 * render pixel-for-pixel as they do for a signed-in doctor, just without the
 * sidebar. The bar is static, not sticky: the wizard already pins its page
 * header and its price rail, and a third fixed band would leave a phone with
 * very little form.
 *
 * `--page-header-top` tells `PageHeader` there is no mobile bar to clear here.
 */
export function PublicShell({ children }: PropsWithChildren) {
  const theme = useTheme();
  const { t } = useTranslation('landing');

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        position: 'relative',
        '--page-header-top': '0px',
      }}
    >
      <Box
        component="header"
        sx={{
          position: 'relative',
          zIndex: 2,
          bgcolor: alpha(theme.palette.background.paper, 0.9),
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ maxWidth: 1140, mx: 'auto', height: 64, px: { xs: 2, md: 3 } }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.25}
            component={RouterLink}
            to={PUBLIC_ROUTES.landing}
            sx={{ color: 'text.primary', textDecoration: 'none' }}
          >
            <BrandMark />
            <Typography sx={{ fontSize: '1.0625rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Dental Labs
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={{ xs: 0.25, sm: 0.75 }}>
            <ColorModeToggle />
            <LanguageSwitcher variant="icon" />
            <Button
              component={RouterLink}
              to="/login"
              variant="text"
              size="small"
              sx={{ ml: { xs: 0.25, sm: 0.5 }, whiteSpace: 'nowrap' }}
            >
              {t('nav.signIn')}
            </Button>
            <Button
              component={RouterLink}
              to="/register/doctor"
              variant="contained"
              size="small"
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, whiteSpace: 'nowrap' }}
            >
              {t('nav.getStarted')}
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box component="main" sx={{ position: 'relative', zIndex: 1 }}>
        <Box
          sx={{
            maxWidth: layout.contentMax,
            mx: 'auto',
            px: layout.gutter,
            pt: { xs: 2.5, md: 3.25 },
            pb: 10,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

/** Route element: the shell around the public catalogue's `Outlet`. */
export function PublicLayout() {
  return (
    <PublicShell>
      <Outlet />
    </PublicShell>
  );
}
