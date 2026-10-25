import {
  Box,
  Checkbox,
  FormControlLabel,
  FormHelperText,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { radii, tone } from '@/theme/tokens';
import { FINAL_PRICE_NOTE_MAX } from './finalPriceNote';

/**
 * "How the price was calculated", under the lab's final price input: the text
 * the doctor reads next to the price, in the "price set" notification and in
 * their orders list. Required whenever a price is entered; when the price
 * changes and the text does not, the lab confirms the text still holds.
 *
 * Controlled: the order sheet owns the values, saves them with the price in
 * one update, and keeps them in step with live refetches (useLiveFormSync).
 */
export function FinalPriceNoteField({
  value,
  onChange,
  required,
  error,
  confirmNeeded,
  confirmed,
  onConfirmedChange,
  confirmError,
}: {
  value: string;
  onChange: (next: string) => void;
  /** A price is entered, so the note must be too. */
  required: boolean;
  /** The note's own error (empty when a price needs one), shown on the field. */
  error: string | null;
  /** The price differs from the saved one and the text is unchanged. */
  confirmNeeded: boolean;
  confirmed: boolean;
  onConfirmedChange: (next: boolean) => void;
  /** A save was tried without the confirmation. */
  confirmError: boolean;
}) {
  const { t } = useTranslation('lab');
  const warn = tone('warning', useTheme().palette.mode);
  const counter = `${value.length} / ${FINAL_PRICE_NOTE_MAX}`;
  return (
    <Stack spacing={1}>
      <TextField
        label={t('orderSheet.finalPriceNote.label')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        error={!!error}
        helperText={
          <Stack component="span" direction="row" justifyContent="space-between" spacing={1}>
            <span>{error ?? t('orderSheet.finalPriceNote.helper')}</span>
            <span style={{ flexShrink: 0 }}>{counter}</span>
          </Stack>
        }
        inputProps={{ maxLength: FINAL_PRICE_NOTE_MAX }}
        multiline
        minRows={3}
        maxRows={10}
        size="small"
        fullWidth
      />
      {confirmNeeded && (
        // The warning callout's look, with a control inside it (Callout's
        // body is a caption line and cannot hold one).
        <Box
          sx={{
            px: 1.5,
            py: 1.25,
            borderRadius: `${radii.tile}px`,
            bgcolor: warn.bg,
            border: 1,
            borderColor: confirmError && !confirmed ? 'error.main' : warn.border,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Icon name="warning" size={18} sx={{ color: warn.fg, flexShrink: 0, mt: 0.125 }} />
            <Typography sx={{ fontSize: '0.78125rem', fontWeight: 600, color: warn.fg, lineHeight: 1.45 }}>
              {t('orderSheet.finalPriceNote.priceChanged')}
            </Typography>
          </Stack>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={confirmed}
                onChange={(e) => onConfirmedChange(e.target.checked)}
              />
            }
            label={t('orderSheet.finalPriceNote.stillCorrect')}
            sx={{ mt: 0.5, mx: 0, '& .MuiFormControlLabel-label': { fontSize: '0.8125rem' } }}
          />
          {confirmError && !confirmed && (
            <FormHelperText error sx={{ m: 0 }}>
              {t('orderSheet.finalPriceNote.confirmRequired')}
            </FormHelperText>
          )}
        </Box>
      )}
    </Stack>
  );
}
