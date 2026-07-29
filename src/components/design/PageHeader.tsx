import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * The title block every redesigned screen opens with: heading, optional
 * subtitle, and right-aligned actions.
 *
 * Below `sm` the actions drop under the title and stretch, so a two-button
 * header does not squash the heading on a phone (the mockups are desktop-only,
 * so this is the extrapolated behaviour agreed in the foundation spec).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  /** `h3` for a dashboard-style greeting, `h4` for a standard page title. */
  size = 'h4',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  size?: 'h3' | 'h4';
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      spacing={2}
      sx={{ mb: 2.75 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant={size} component="h1">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.25 }}>
            {subtitle}
          </Typography>
        )}
      </Box>

      {actions && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            ml: { sm: 'auto' },
            flexShrink: 0,
            '& > *': { flex: { xs: 1, sm: 'initial' } },
          }}
        >
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
