import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatGEL } from '@/utils/pricing';
import type { LabReceivableOrder } from '@/types/database';
import { recordPayment } from './financeApi';

type Props = {
  order: LabReceivableOrder | null;
  open: boolean;
  onClose: () => void;
  /** Called after a successful save so the parent can refetch + close. */
  onSaved: () => void;
};

export function RecordPaymentDialog({ order, open, onClose, onSaved }: Props) {
  const { t } = useTranslation('lab');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const final = order ? Number(order.final_total) : 0;
  const paid = order ? Number(order.paid_total) : 0;

  useEffect(() => {
    if (order) {
      setAmount(String(paid));
      setError(null);
    }
  }, [order, paid]);

  const save = useMutation({
    mutationFn: async () => {
      if (!order) return;
      await recordPayment(order.order_id, amount === '' ? 0 : Number(amount));
    },
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  if (!order) return null;

  const parsed = amount === '' ? 0 : Number(amount);
  const clamped = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 0, 0), final);
  const outstandingAfter = Math.max(final - clamped, 0);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('finances.dialog.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {t('finances.dialog.order', { code: order.order_code })} · {order.customer_name}
          </Typography>

          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {t('finances.dialog.finalPrice')}
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {formatGEL(final)}
            </Typography>
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            type="number"
            label={t('finances.dialog.amountLabel')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            helperText={t('finances.dialog.amountHelp')}
            size="small"
            autoFocus
            InputProps={{
              endAdornment: (
                <Button size="small" onClick={() => setAmount(String(final))}>
                  {t('finances.dialog.markPaid')}
                </Button>
              ),
            }}
          />

          <Typography variant="body2" color="text.secondary">
            {t('finances.dialog.outstandingAfter', { amount: formatGEL(outstandingAfter) })}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          {t('finances.dialog.cancel')}
        </Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>
          {t('finances.dialog.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
