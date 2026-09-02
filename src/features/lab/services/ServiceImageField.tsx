import { useRef, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Icon, FieldLabel } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { radii } from '@/theme/tokens';
import {
  ACCEPTED_IMAGE_TYPES,
  ServiceImageError,
  removeServiceImage,
  uploadServiceImage,
} from './serviceImage';
import type { ServiceBasicsInput } from './serviceBasicsSchema';

/**
 * The service's cover picture.
 *
 * Replaces the old "cover image URL" text box: a lab pasting a link meant the
 * picture lived on someone else's server and broke when that server did. The
 * file goes into our own bucket and the form field holds the resulting URL, so
 * everything downstream still reads one string.
 *
 * The upload happens immediately rather than on save — the preview has to show
 * the real stored image, and a picture that only uploads on submit would leave
 * the form lying about what it is going to keep.
 */
export function ServiceImageField() {
  const { t } = useTranslation('lab');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const { setValue, control } = useFormContext<ServiceBasicsInput>();
  const url = useWatch({ control, name: 'cover_image_url' });

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Files this form uploaded, which nothing else references yet. Only these
  // are safe to delete: the image the service was loaded with is still live in
  // the database, and cleaning it up here would break the card for everyone if
  // the lab then closed the form without saving.
  const uploadedHere = useRef<Set<string>>(new Set());

  const pick = async (file: File | undefined) => {
    if (!file || !labId) return;
    setError(null);
    setBusy(true);
    try {
      const previous = url;
      const next = await uploadServiceImage(labId, file);
      uploadedHere.current.add(next);
      setValue('cover_image_url', next, { shouldDirty: true });
      if (previous && uploadedHere.current.has(previous)) {
        uploadedHere.current.delete(previous);
        await removeServiceImage(previous);
      }
    } catch (e) {
      const kind = e instanceof ServiceImageError ? e.kind : 'failed';
      setError(t(`services.image.errors.${kind}`));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const clear = async () => {
    const previous = url;
    setValue('cover_image_url', '', { shouldDirty: true });
    if (previous && uploadedHere.current.has(previous)) {
      uploadedHere.current.delete(previous);
      await removeServiceImage(previous);
    }
  };

  return (
    <Box>
      <FieldLabel sx={{ mb: 0.75 }}>{t('services.image.label')}</FieldLabel>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        hidden
        onChange={(e) => void pick(e.target.files?.[0])}
      />

      {url ? (
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Box
            component="img"
            src={url}
            alt=""
            sx={{
              width: 148,
              height: 100,
              objectFit: 'cover',
              borderRadius: `${radii.control}px`,
              border: 1,
              borderColor: 'divider',
              flexShrink: 0,
            }}
          />
          <Stack spacing={1} alignItems="flex-start">
            <Button
              size="small"
              variant="outlined"
              startIcon={<Icon name="upload" size={15} />}
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {t('services.image.replace')}
            </Button>
            <Button size="small" color="inherit" onClick={() => void clear()} disabled={busy}>
              {t('services.image.remove')}
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack
          role="button"
          tabIndex={0}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          alignItems="center"
          justifyContent="center"
          spacing={0.75}
          sx={{
            height: 100,
            cursor: busy ? 'default' : 'pointer',
            borderRadius: `${radii.control}px`,
            border: '1px dashed',
            borderColor: 'divider',
            color: 'text.secondary',
            '&:hover': { borderColor: 'primary.main', color: 'text.primary' },
          }}
        >
          {busy ? (
            <CircularProgress size={20} />
          ) : (
            <>
              <Icon name="add_photo_alternate" size={22} />
              <Typography variant="caption">{t('services.image.upload')}</Typography>
            </>
          )}
        </Stack>
      )}

      <Typography
        variant="caption"
        sx={{ display: 'block', mt: 0.75, color: error ? 'error.main' : 'text.secondary' }}
      >
        {error ?? t('services.image.hint')}
      </Typography>
    </Box>
  );
}
