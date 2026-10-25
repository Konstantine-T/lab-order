import { Box, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FieldLabel } from '@/components/design';
import { shortDateTime } from '@/features/orders/detail/format';
import { radii } from '@/theme/tokens';

/**
 * "The lab's explanation" under a final price (to75nCxF): how the lab arrived
 * at the figure, in its own words, with when it last wrote or confirmed it.
 * Renders nothing without a note — an order priced before the explanation
 * became required has none.
 */
export function FinalPriceNote({ note, at }: { note: string | null | undefined; at?: string | null }) {
  const { t } = useTranslation('common');
  const text = note?.trim();
  if (!text) return null;
  return (
    <Box
      sx={{
        mt: 0.75,
        px: 1.5,
        py: 1.25,
        borderRadius: `${radii.control}px`,
        bgcolor: 'background.default',
      }}
    >
      <Stack spacing={0.5}>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
          <FieldLabel>{t('priceBreakdown.finalPriceNoteTitle')}</FieldLabel>
          {at && (
            <Typography
              component="time"
              dateTime={at}
              variant="caption"
              color="text.secondary"
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {shortDateTime(at)}
            </Typography>
          )}
        </Stack>
        {/* The lab's text as written, line breaks kept: it is often a short
            list of what went into the price. */}
        <Typography
          variant="body2"
          sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6 }}
        >
          {text}
        </Typography>
      </Stack>
    </Box>
  );
}
