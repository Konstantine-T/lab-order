import { useState } from 'react';
import { Alert, IconButton, Snackbar, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { FeedbackDialog } from './FeedbackDialog';

/** Header entry point for user feedback. Rendered once in AppShell for every
 *  area — the role gate lives here rather than in the four layouts, so the
 *  shell stays role-agnostic. Admins receive feedback; they don't send it. */
export function FeedbackButton() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.role === 'PLATFORM_ADMIN') return null;

  return (
    <>
      <Tooltip title={t('feedback.tooltip')}>
        <IconButton onClick={() => setOpen(true)} color="inherit" aria-label={t('feedback.title')}>
          <Icon name="feedback" size={20} />
        </IconButton>
      </Tooltip>

      <FeedbackDialog open={open} onClose={() => setOpen(false)} onSent={() => setSent(true)} />

      <Snackbar
        open={sent}
        autoHideDuration={5000}
        onClose={() => setSent(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSent(false)} variant="filled">
          {t('feedback.success')}
        </Alert>
      </Snackbar>
    </>
  );
}
