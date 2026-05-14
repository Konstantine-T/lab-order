import { Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import type { PropsWithChildren } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ColorModeToggle } from '@/components/ColorModeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export function PublicAuthLayout({ children }: PropsWithChildren) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        position: 'relative',
        overflow: 'hidden',
        // Soft brand-tinted radial accents — subtle, premium ambient lighting.
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 12% 0%, ${alpha(theme.palette.primary.main, 0.12)} 0%, transparent 45%), radial-gradient(circle at 90% 100%, ${alpha(theme.palette.primary.main, 0.08)} 0%, transparent 50%)`,
          pointerEvents: 'none',
          zIndex: 0,
        },
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: { xs: 2, md: 4 }, py: 2.5, position: 'relative', zIndex: 1 }}
      >
        <Typography
          component={RouterLink}
          to="/"
          variant="h6"
          sx={{
            color: 'text.primary',
            textDecoration: 'none',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
          }}
        >
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: 1.5,
              bgcolor: 'primary.main',
              display: 'inline-block',
            }}
          />
          Lab Order
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <ColorModeToggle />
          <LanguageSwitcher variant="icon" />
        </Stack>
      </Stack>
      <Container
        maxWidth="sm"
        sx={{
          py: { xs: 2, md: 6 },
          position: 'relative',
          zIndex: 1,
        }}
      >
        {children}
      </Container>
    </Box>
  );
}
