import { useState } from 'react';
import { Box, ClickAwayListener, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';

/**
 * The small "info" beside a final price on the doctor's and the clinic's order
 * cards (to75nCxF): the lab's explanation of the price, in a tooltip. Hover or
 * focus on a desktop; a tap (a click) opens it, so on a phone it shows at
 * once and stays until the next tap anywhere. Clamped to about six lines —
 * the order page has all of it.
 *
 * The card's body is one link, so a tap here is kept from opening the order.
 * Renders nothing without a note.
 */
export function FinalPriceNoteIcon({ note }: { note: string | null | undefined }) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const text = note?.trim();
  if (!text) return null;
  const label = t('priceBreakdown.finalPriceNoteTitle');
  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Tooltip
        arrow
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        // Taps go through onClick below: the touch listener would open on
        // touchstart and the click right after would close it again.
        disableTouchListener
        title={
          <Box sx={{ py: 0.25 }}>
            <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, mb: 0.25 }}>{label}</Typography>
            <Typography
              sx={{
                fontSize: '0.75rem',
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                display: '-webkit-box',
                WebkitLineClamp: 6,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {text}
            </Typography>
          </Box>
        }
      >
        <Box
          component="span"
          role="img"
          tabIndex={0}
          aria-label={`${label}: ${text}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen(true);
          }}
          sx={{
            display: 'inline-flex',
            alignSelf: 'center',
            color: 'text.secondary',
            cursor: 'help',
            lineHeight: 0,
            borderRadius: '50%',
            '&:hover': { color: 'text.primary' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
          }}
        >
          <Icon name="info" size={15} />
        </Box>
      </Tooltip>
    </ClickAwayListener>
  );
}
