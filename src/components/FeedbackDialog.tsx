import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

const MAX_MESSAGE_LENGTH = 2000;

export function FeedbackDialog({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t, i18n } = useTranslation('common');
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('not_authenticated');
      // No .select() — senders have no SELECT policy on feedback, so a
      // RETURNING clause would be blocked by RLS. A bare insert sends
      // Prefer: return=minimal, which is what this needs.
      const { error } = await supabase.from('feedback').insert({
        user_id: user.id,
        message: message.trim(),
        page_path: pathname,
        // The language detector can return a region tag ("en-US"); the column
        // stores the plain two-letter code used everywhere else.
        lang: (i18n.resolvedLanguage ?? i18n.language).slice(0, 2),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage('');
      setFailed(false);
      onSent();
      onClose();
    },
    onError: () => setFailed(true),
  });

  const canSubmit = message.trim().length > 0 && !send.isPending;

  const handleClose = () => {
    if (send.isPending) return;
    setFailed(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('feedback.title')}</DialogTitle>
      <DialogContent>
        {failed && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('errors.generic')}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={4}
          maxRows={10}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          placeholder={t('feedback.placeholder')}
          inputProps={{ maxLength: MAX_MESSAGE_LENGTH }}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={send.isPending}>
          {t('actions.cancel')}
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => send.mutate()}>
          {t('actions.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
