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
  requestDoctorInput,
} from './clarificationsApi';

/**
 * "What needs clarifying?" — the lab's side of the exchange.
 *
 * Lives here rather than in the order sheet because the queue can set
 * NEEDS_CLARIFICATION too, from its inline status select. Both entry points
 * have to capture a question or the doctor gets the badge without the reason,
 * which is the whole bug.
 *
 * `kind` picks which half of the conversation this is. Both write the same
 * row and both move the order in one call; they differ in the status they set
 * and in how the doctor is expected to close it — by replying, or by changing
 * the order and saving.
 */
export function ClarificationAskDialog({
  orderId,
  open,
  onClose,
  onSent,
  kind = 'ANSWER',
}: {
  /** Null while no order is selected — the dialog stays closed. */
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  /** ANSWER → NEEDS_CLARIFICATION. EDIT → NEEDS_DOCTOR_INPUT. */
  kind?: 'ANSWER' | 'EDIT';
}) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Same modal, same row, different promise to the doctor — so the copy has
  // to change with it, not just the RPC.
  const copy = kind === 'EDIT' ? 'orderSheet.editRequestModal' : 'orderSheet.clarifyModal';

  const ask = useMutation({
    mutationFn: () =>
      kind === 'EDIT'
        ? requestDoctorInput(orderId!, question.trim())
        : requestClarification(orderId!, question.trim()),
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
      <DialogTitle>{t(`${copy}.title`)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <DialogContentText>{t(`${copy}.body`)}</DialogContentText>
          <TextField
            label={t(`${copy}.questionLabel`)}
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
          {t(`${copy}.cancel`)}
        </Button>
        <Button
          variant="contained"
          disabled={!question.trim() || ask.isPending}
          onClick={() => ask.mutate()}
        >
          {t(`${copy}.confirm`)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
