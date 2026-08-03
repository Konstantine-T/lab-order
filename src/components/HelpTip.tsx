import { Box, Tooltip } from '@mui/material';
import { Icon } from '@/components/design';

/**
 * A small "?" help affordance: an info icon that reveals `text` in a tooltip.
 * Renders nothing when there is no text, so callers can wire it everywhere and
 * let per-item help copy appear as it's authored.
 *
 * Safe to place inside a clickable container (e.g. a card's action area): the
 * click is stopped from propagating so opening help never triggers the parent.
 */
export function HelpTip({
  text,
  label = 'Help',
  size = 16,
}: {
  text?: string | null;
  label?: string;
  size?: number;
}) {
  if (!text) return null;
  return (
    <Tooltip title={text} arrow enterTouchDelay={0} leaveTouchDelay={5000}>
      <Box
        component="span"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          color: 'text.secondary',
          cursor: 'help',
          lineHeight: 0,
          '&:hover': { color: 'text.primary' },
        }}
      >
        <Icon name="help" size={size} />
      </Box>
    </Tooltip>
  );
}
