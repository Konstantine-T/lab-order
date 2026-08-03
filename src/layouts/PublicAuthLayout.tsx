import { alpha, Box, Container, Stack, Typography, useTheme } from '@mui/material';
import type { PropsWithChildren, ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ColorModeToggle } from '@/components/ColorModeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Icon } from '@/components/design';
import { radii } from '@/theme/tokens';

/**
 * The signed-out chrome: the landing mockup's translucent top bar over the
 * app background, with its radial brand wash behind the content.
 *
 * The auth screens themselves aren't in the mockups; this reuses the landing
 * page's nav and hero treatment so they read as the same product.
 */
export function PublicAuthLayout({
  children,
  title,
  subtitle,
  maxWidth = 'sm',
}: PropsWithChildren<{
  title?: ReactNode;
  subtitle?: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md';
}>) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        position: 'relative',
        overflow: 'hidden',
        // The landing page's hero wash: a wide radial brand tint from the top.
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(900px 420px at 50% -80px, ${alpha(
            theme.palette.primary.main,
            0.14,
          )}, transparent 70%)`,
          pointerEvents: 'none',
          zIndex: 0,
        },
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          bgcolor: alpha(theme.palette.background.paper, 0.9),
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
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
            to="/"
            sx={{ color: 'text.primary', textDecoration: 'none' }}
          >
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: '9px',
                bgcolor: 'primary.main',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="dentistry" size={19} filled color="#fff" />
            </Box>
            <Typography sx={{ fontSize: '1.0625rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Lab Order
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.5}>
            <ColorModeToggle />
            <LanguageSwitcher variant="icon" />
          </Stack>
        </Stack>
      </Box>

      <Container
        maxWidth={maxWidth}
        sx={{ py: { xs: 4, md: 7 }, position: 'relative', zIndex: 1 }}
      >
        {(title || subtitle) && (
          <Stack spacing={0.75} sx={{ textAlign: 'center', mb: 3 }}>
            {title && (
              <Typography variant="h2" component="h1">
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="subtitle1" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Stack>
        )}

        <Box
          sx={{
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: `${radii.card}px`,
            p: { xs: 2.5, sm: 3.5 },
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.08), 0 4px 14px rgba(15, 23, 42, 0.04)',
          }}
        >
          {children}
        </Box>
      </Container>
    </Box>
  );
}
