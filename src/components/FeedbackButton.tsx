import { useState } from 'react';
import { Alert, IconButton, Snackbar, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { FeedbackDialog } from './FeedbackDialog';
import { useCanSendFeedback } from './useCanSendFeedback';

/**
 * The dialog plus its "thanks" toast, with the open state owned by the caller —
 * so a trigger that unmounts on click (a menu item) can still open it.
 */
export function FeedbackFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('common');
  const [sent, setSent] = useState(false);

  return (
    <>
      <FeedbackDialog open={open} onClose={onClose} onSent={() => setSent(true)} />

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

/** Header entry point for user feedback. Rendered once in AppShell for every
 *  area — the role gate lives here rather than in the four layouts, so the
 *  shell stays role-agnostic. */
export function FeedbackButton() {
  const { t } = useTranslation('common');
  const canSend = useCanSendFeedback();
  const [open, setOpen] = useState(false);

  if (!canSend) return null;

  return (
    <>
      <Tooltip title={t('feedback.tooltip')}>
        <IconButton onClick={() => setOpen(true)} color="inherit" aria-label={t('feedback.title')}>
          <Icon name="feedback" size={20} />
        </IconButton>
      </Tooltip>

      <FeedbackFlow open={open} onClose={() => setOpen(false)} />
    </>
  );
}
