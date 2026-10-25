import { useRef, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FieldLabel, Icon } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { classifyLabProfileError } from '@/features/lab/labProfileErrors';
import type { LabRow } from '@/types/database';
import { ACCEPTED_LOGO_TYPES, LabLogoError, removeLabLogo, uploadLabLogo } from './labLogo';
import { LabLogoTile } from './LabLogoTile';

type Status = { tone: 'success' | 'error'; text: string } | null;

/**
 * The lab's logo on its profile page: upload, replace or remove a file in the
 * lab-logos bucket (0047). Replaces the old "Logo URL" text box.
 *
 * Saves on the spot, not with the profile's Save button: the preview must show
 * what is actually stored, and an approved lab — whose profile form is locked —
 * has no other way to change it. That is also why `logo_url` is no longer part
 * of the profile form at all: a form holding the old URL would write it back
 * over a freshly uploaded logo on the next Save.
 *
 * The old file is deleted only after the row points at the new one, so a
 * failed update never leaves the lab with a logo URL to a missing file.
 */
export function LabLogoField({ lab, canEdit }: { lab: LabRow; canEdit: boolean }) {
  const { t } = useTranslation('lab');
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  // What this field last wrote, until the refreshed lab row catches up: shown
  // straight away rather than after the AppUser reload. Keyed to the stored
  // value it replaced, so once the row moves on (the reload, or anyone else's
  // change) the stored value wins again.
  const stored = lab.logo_url ?? null;
  const [written, setWritten] = useState<{ from: string | null; to: string | null } | null>(null);
  const url = written && written.from === stored ? written.to : stored;

  const write = async (next: string | null): Promise<boolean> => {
    const { error } = await supabase.from('labs').update({ logo_url: next }).eq('id', lab.id);
    if (error) {
      const kind = classifyLabProfileError(error);
      setStatus({
        tone: 'error',
        text: kind === 'generic' ? t('profile.logo.errors.failed') : t(`profile.errors.${kind}`),
      });
      return false;
    }
    setWritten({ from: stored, to: next });
    // Every surface that draws the logo.
    for (const key of [['marketplace-labs'], ['landing-labs'], ['public-lab', lab.id]]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    // Silent: a spinner would re-mount the profile page and drop what the lab
    // is typing in the form around this field.
    void refreshUser({ silent: true });
    return true;
  };

  const pick = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file || !canEdit) return;
    setStatus(null);
    setBusy(true);
    try {
      const previous = url;
      const next = await uploadLabLogo(lab.id, file);
      if (await write(next)) {
        await removeLabLogo(previous);
        setStatus({ tone: 'success', text: t('profile.logo.saved') });
      } else {
        // The row still points at the previous logo; drop the orphan.
        await removeLabLogo(next);
      }
    } catch (e) {
      const kind = e instanceof LabLogoError ? e.kind : 'failed';
      setStatus({ tone: 'error', text: t(`profile.logo.errors.${kind}`) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!canEdit || !url) return;
    setStatus(null);
    setBusy(true);
    try {
      const previous = url;
      if (await write(null)) {
        await removeLabLogo(previous);
        setStatus({ tone: 'success', text: t('profile.logo.removed') });
      }
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !canEdit;

  return (
    <Box>
      <FieldLabel sx={{ mb: 0.75 }}>{t('profile.logo.title')}</FieldLabel>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_LOGO_TYPES.join(',')}
        hidden
        onChange={(e) => void pick(e.target.files?.[0])}
      />

      <Stack direction="row" spacing={2} alignItems="center">
        <LabLogoTile url={url} name={lab.public_name} colorSeed={lab.public_name}>
          {busy && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'action.disabledBackground',
              }}
            >
              <CircularProgress size={22} />
            </Box>
          )}
        </LabLogoTile>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ minWidth: 0 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Icon name="upload" size={15} />}
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            {url ? t('profile.logo.replace') : t('profile.logo.upload')}
          </Button>
          {url && (
            <Button
              size="small"
              color="inherit"
              startIcon={<Icon name="delete" size={15} />}
              onClick={() => void remove()}
              disabled={disabled}
            >
              {t('profile.logo.remove')}
            </Button>
          )}
        </Stack>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {t('profile.logo.hint')}
      </Typography>
      <Box role="status" aria-live="polite">
        {status && (
          <Typography
            variant="caption"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 0.25,
              color: status.tone === 'error' ? 'error.main' : 'success.main',
            }}
          >
            <Icon name={status.tone === 'error' ? 'error' : 'check_circle'} size={14} />
            {status.text}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
