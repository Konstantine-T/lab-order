import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  classifyClarificationError,
  clarificationsKey,
  requestClarification,
} from './clarificationsApi';

/**
 * "What needs clarifying?" — the lab's side of the exchange.
 *
 * Lives here rather than in the order sheet because the queue can set
 * NEEDS_CLARIFICATION too, from its inline status select. Both entry points
 * have to capture a question or the doctor gets the badge without the reason,
 * which is the whole bug.
 */
export function ClarificationAskDialog({
  orderId,
  open,
  onClose,
  onSent,
}: {
  /** Null while no order is selected — the dialog stays closed. */
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ask = useMutation({
    mutationFn: () => requestClarification(orderId!, question.trim()),
    onSuccess: () => {
      setQuestion('');
      setError(null);
      qc.invalidateQueries({ queryKey: clarificationsKey(orderId!) });
      qc.invalidateQueries({ queryKey: ['lab-order', orderId] });
      qc.invalidateQueries({ queryKey: ['lab-orders'] });
      qc.invalidateQueries({ queryKey: ['nav-alerts'] });
      onSent?.();
      onClose();
    },
    onError: (e) =>
      setError(
        tc(
          `errors.clarification.${classifyClarificationError(e)}` as
            'errors.clarification.generic',
        ),
      ),
  });

  const close = () => {
    setQuestion('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open && !!orderId} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle>{t('orderSheet.clarifyModal.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <DialogContentText>{t('orderSheet.clarifyModal.body')}</DialogContentText>
          <TextField
            label={t('orderSheet.clarifyModal.questionLabel')}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            autoFocus
            inputProps={{ maxLength: 2000 }}
          />
          {error && (
            <Typography variant="caption" color="error">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} color="inherit">
          {t('orderSheet.clarifyModal.cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={!question.trim() || ask.isPending}
          onClick={() => ask.mutate()}
        >
          {t('orderSheet.clarifyModal.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
