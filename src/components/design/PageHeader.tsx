import { alpha, Box, Stack, Typography, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from '@/components/design/Icon';
import { layout, motion } from '@/theme/tokens';

/**
 * The band every redesigned screen opens with: a sticky, translucent header
 * that blurs the content scrolling under it, holding an optional back button,
 * the title, a meta line and right-aligned actions.
 *
 * It sits inside `AppShell`'s padded content column but bleeds its background
 * to the full width of the main area — hence the negative gutters, which are
 * the exact inverse of the column's own padding.
 *
 * Below `sm` the actions drop under the title and stretch, and the band stops
 * being sticky so a tall wrapped header cannot eat the viewport.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  backTo,
  onBack,
  chips,
  size = 'h4',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Renders a back square linking here. */
  backTo?: string;
  /** Renders a back square calling this instead — for wizards that must warn. */
  onBack?: () => void;
  /** Chips rendered inline after the title — status pills, counters. */
  chips?: ReactNode;
  /** `h3` for a dashboard-style greeting, `h4` for a standard page title. */
  size?: 'h3' | 'h4';
}) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        position: { xs: 'static', sm: 'sticky' },
        top: { sm: layout.mobileBar, md: 0 },
        zIndex: 40,
        mx: layout.gutterNeg,
        mt: { xs: -2.5, md: -3.25 },
        mb: 2.75,
        px: layout.gutter,
        py: { xs: 1.5, md: 1.75 },
        bgcolor: alpha(theme.palette.background.default, 0.88),
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={{ xs: 1.5, sm: 1.75 }}
      >
        <Stack direction="row" alignItems="center" spacing={1.75} sx={{ minWidth: 0 }}>
          {(backTo || onBack) && (
            <Box
              {...(backTo
                ? ({ component: RouterLink, to: backTo } as const)
                : ({ component: 'button', type: 'button', onClick: onBack } as const))}
              aria-label="back"
              sx={{
                width: 32,
                height: 32,
                flexShrink: 0,
                p: 0,
                display: 'grid',
                placeItems: 'center',
                borderRadius: '9px',
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                color: 'text.primary',
                cursor: 'pointer',
                transition: `border-color ${motion.base}`,
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              <Icon name="arrow_back" size={18} />
            </Box>
          )}

          <Box sx={{ minWidth: 0 }}>
            <Stack
              direction="row"
              alignItems="center"
              sx={{ flexWrap: 'wrap', gap: 1.25, rowGap: 0.5 }}
            >
              <Typography variant={size} component="h1" sx={{ minWidth: 0 }}>
                {title}
              </Typography>
              {chips}
            </Stack>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Stack>

        {actions && (
          <Stack
            direction="row"
            alignItems="center"
            sx={{
              ml: { sm: 'auto' },
              flexShrink: 0,
              flexWrap: { xs: 'wrap', md: 'nowrap' },
              gap: 1.125,
              '& > *': { flex: { xs: 1, sm: 'initial' } },
            }}
          >
            {actions}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
