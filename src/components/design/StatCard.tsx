import { Box, Card, CardActionArea, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Icon } from '@/components/design/Icon';
import { focusRing, lift, motion } from '@/theme/tokens';

/**
 * The metric card from the dashboard mockups: a dotted label, a large value and
 * a caption. Four of these sit in a row on desktop; the grid that holds them
 * belongs to the page, not here.
 *
 * With `onClick` the whole card is a button that opens what it counts: hover
 * lift, the shared focus ring and an arrow in the corner as the affordance.
 * Pass no `onClick` for a value of 0, as `StatTile` does: there is nothing to
 * show, so the card stays plain text with no hover.
 */
export function StatCard({
  label,
  value,
  caption,
  dotColor,
  onClick,
  ariaLabel,
}: {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  /** Status dot beside the label — any theme colour or raw CSS colour. */
  dotColor?: string;
  onClick?: () => void;
  /** The button's accessible name, e.g. "Show new orders". */
  ariaLabel?: string;
}) {
  const content = (
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
          sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 0, flex: onClick ? 1 : undefined }}
          noWrap
        >
          {label}
        </Typography>
        {onClick && (
          <Box
            className="stat-card-arrow"
            sx={{
              display: 'flex',
              flexShrink: 0,
              color: 'text.disabled',
              transition: `color ${motion.base}, transform ${motion.base}`,
            }}
          >
            <Icon name="arrow_forward" size={16} />
          </Box>
        )}
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
  );

  if (!onClick) return <Card>{content}</Card>;

  return (
    <Card
      sx={{
        transition: `border-color ${motion.base}, box-shadow ${motion.base}, transform ${motion.fast}`,
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: lift.card,
          transform: 'translateY(-1px)',
          '& .stat-card-arrow': { color: 'primary.main', transform: 'translateX(2px)' },
        },
        // Keyboard focus only (MUI marks it Mui-focusVisible): a mouse click
        // focuses the button too, and must not leave a ring behind.
        '&:has(.Mui-focusVisible)': focusRing,
      }}
    >
      <CardActionArea
        onClick={onClick}
        aria-label={ariaLabel}
        disableRipple
        sx={{
          height: '100%',
          '&:focus-visible': { outline: 'none' },
          // The card's own border and glow are the focus ring; the action
          // area's grey wash on top of them reads as a second, muddier one.
          '& .MuiCardActionArea-focusHighlight': { display: 'none' },
        }}
      >
        {content}
      </CardActionArea>
    </Card>
  );
}
