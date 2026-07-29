import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * The metric card from the dashboard mockups: a dotted label, a large value and
 * a caption. Four of these sit in a row on desktop; the grid that holds them
 * belongs to the page, not here.
 */
export function StatCard({
  label,
  value,
  caption,
  dotColor,
}: {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  /** Status dot beside the label — any theme colour or raw CSS colour. */
  dotColor?: string;
}) {
  return (
    <Card>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          {dotColor && (
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: dotColor,
                flexShrink: 0,
              }}
            />
          )}
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 0 }}
            noWrap
          >
            {label}
          </Typography>
        </Stack>

        <Typography
          sx={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.025em', mt: 0.75 }}
        >
          {value}
        </Typography>

        {caption && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {caption}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
