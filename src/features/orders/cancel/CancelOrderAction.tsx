import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  alpha,
} from '@mui/material';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Callout, Icon } from '@/components/design';
import { supabase } from '@/lib/supabase';
import type { OrderStatus } from '@/types/database';

const REASON_MAX = 1000;

type CancelErrorKind = 'alreadyAccepted' | 'notYourOrder' | 'notAllowed' | 'reasonTooLong' | 'generic';

/**
 * cancel_order (0045) raises bare codes, all of which arrive in `message`.
 * Never render the raw Postgres string: it is English-only and can talk about
 * row-level security at the user.
 */
function classifyCancelError(err: unknown): CancelErrorKind {
  const msg = String((err as { message?: string })?.message ?? '').toLowerCase();
  if (msg.includes('order_already_accepted')) return 'alreadyAccepted';
  if (msg.includes('reason_too_long')) return 'reasonTooLong';
  if (msg.includes('not_your_order') || msg.includes('order_not_found')) return 'notYourOrder';
  if (msg.includes('status_change_not_allowed') || msg.includes('permission')) return 'notAllowed';
  return 'generic';
}

type Props = {
  orderId: string;
  status: OrderStatus;
  /** The detail page's own order key: `['order', id]` or `['clinic-order', id]`. */
  orderKey: QueryKey;
};

/**
 * "Cancel order" for the doctor and the clinic admin acting for them, shared
 * by both detail pages' rail footers.
 *
 * Offered only while the order is SUBMITTED, i.e. the lab has not accepted it
 * yet. After that the doctor talks to the lab instead, and the database agrees:
 * cancel_order refuses anything but SUBMITTED, and a direct status write from
 * the doctor side is refused outright (0045).
 *
 * If the lab accepts while the dialog is open, the RPC answers
 * order_already_accepted: the dialog closes, the order refetches (taking the
 * button with it) and a note explains why. The note is local state, so it
 * outlives the button for as long as the page is open.
 */
export function CancelOrderAction({ orderId, status, orderKey }: Props) {
  const { t } = useTranslation('doctor');
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<Exclude<CancelErrorKind, 'alreadyAccepted'> | null>(null);
  const [acceptedMeanwhile, setAcceptedMeanwhile] = useState(false);

  const cancel = useMutation({
    mutationFn: async () => {
      const trimmed = reason.trim();
      const { error: rpcError } = await supabase.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: trimmed || null,
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: () => {
      setOpen(false);
      setReason('');
      qc.invalidateQueries({ queryKey: orderKey });
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['clinic-order', orderId] });
      qc.invalidateQueries({ queryKey: ['doctor-orders'] });
      qc.invalidateQueries({ queryKey: ['doctor-home-orders'] });
      qc.invalidateQueries({ queryKey: ['clinic-orders'] });
      qc.invalidateQueries({ queryKey: ['nav-alerts'] });
    },
    onError: (e) => {
      const kind = classifyCancelError(e);
      if (kind === 'alreadyAccepted') {
        setOpen(false);
        setAcceptedMeanwhile(true);
        qc.invalidateQueries({ queryKey: orderKey });
        return;
      }
      setError(kind);
    },
  });

  if (acceptedMeanwhile && status !== 'SUBMITTED') {
    return <Callout tone="warning">{t('orderDetail.cancel.alreadyAccepted')}</Callout>;
  }
  if (status !== 'SUBMITTED') return null;

  const close = () => {
    if (cancel.isPending) return;
    setOpen(false);
    setError(null);
  };

  return (
    <>
      <Button
        color="error"
        variant="outlined"
        fullWidth
        startIcon={<Icon name="block" size={16} />}
        // The theme paints every outlined button ink-on-white; a destructive
        // one keeps its red, from the palette rather than a hex.
        sx={{
          color: 'error.main',
          borderColor: (th) => alpha(th.palette.error.main, 0.45),
          '&:hover': {
            borderColor: 'error.main',
            backgroundColor: (th) => alpha(th.palette.error.main, 0.06),
          },
        }}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {t('orderDetail.cancel.button')}
      </Button>

      <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
        <DialogTitle>{t('orderDetail.cancel.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t('orderDetail.cancel.notAcceptedYet')}</DialogContentText>
          <TextField
            label={t('orderDetail.cancel.reasonLabel')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            inputProps={{ maxLength: REASON_MAX }}
            helperText={reason.length > REASON_MAX * 0.9 ? `${reason.length}/${REASON_MAX}` : undefined}
            multiline
            minRows={2}
            fullWidth
            autoFocus
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {t(`orderDetail.cancel.errors.${error}`)}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={cancel.isPending}>
            {t('orderDetail.cancel.keep')}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setError(null);
              cancel.mutate();
            }}
            disabled={cancel.isPending}
          >
            {t('orderDetail.cancel.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
