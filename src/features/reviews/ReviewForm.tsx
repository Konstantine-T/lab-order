import { useState } from 'react';
import { Box, Rating, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { COMMENT_MAX, reviewDraftError, starSx, type ReviewDraft } from './reviewDraft';

/**
 * The review's fields: five stars with a one-word caption, and the comment,
 * which becomes required at 1 or 2 stars. The dialog around it owns the
 * buttons; `showErrors` turns on once the doctor has tried to submit, so a
 * refusal is always a visible message under the field, never a silent no.
 */
export function ReviewForm({
  value,
  onChange,
  showErrors,
  disabled,
}: {
  value: ReviewDraft;
  onChange: (next: ReviewDraft) => void;
  showErrors: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation('doctor');
  const { t: te } = useTranslation('errors');
  // The star under the pointer, for the caption; -1 when none.
  const [hover, setHover] = useState(-1);
  const low = value.rating !== null && value.rating <= 2;
  const error = showErrors ? reviewDraftError(value) : null;
  const shown = hover > 0 ? hover : value.rating;
  const length = value.comment.trim().length;

  return (
    <Stack spacing={2.25}>
      <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
        <Typography
          component="legend"
          sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary', mb: 0.75, p: 0 }}
        >
          {t('reviews.form.ratingLabel')}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
          <Rating
            name="lab-review-rating"
            size="large"
            value={value.rating}
            disabled={disabled}
            onChange={(_, rating) => onChange({ ...value, rating })}
            onChangeActive={(_, v) => setHover(v)}
            getLabelText={(v: number) => t('reviews.starLabel', { count: v })}
            sx={starSx}
          />
          <Typography
            aria-live="polite"
            sx={{ fontSize: '0.875rem', fontWeight: 600, minHeight: '1.3em', color: 'text.primary' }}
          >
            {shown ? t(`reviews.caption.${shown}`) : ''}
          </Typography>
        </Stack>
      </Box>

      <TextField
        multiline
        minRows={3}
        maxRows={10}
        fullWidth
        disabled={disabled}
        required={low}
        value={value.comment}
        onChange={(e) => onChange({ ...value, comment: e.target.value })}
        placeholder={low ? t('reviews.form.placeholderLow') : t('reviews.form.placeholder')}
        error={!!error}
        inputProps={{
          maxLength: COMMENT_MAX,
          'aria-label': low ? t('reviews.form.placeholderLow') : t('reviews.form.placeholder'),
        }}
        helperText={
          <Box component="span" sx={{ display: 'flex', gap: 1, justifyContent: 'space-between' }}>
            <span>{error ? te(`reviews.${error}`) : ''}</span>
            <Box component="span" sx={{ flexShrink: 0 }}>
              {length}/{COMMENT_MAX}
            </Box>
          </Box>
        }
        FormHelperTextProps={{ sx: { mx: 0 } }}
      />
    </Stack>
  );
}
