import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { canComplete } from '@/types/database';
import type { OrderStatus } from '@/types/database';
import { openCompletionDialog } from './completionDialog';

type Props = {
  orderId: string;
  status: OrderStatus;
  /** Rendered small enough to sit in a PageHeader actions slot. */
  size?: 'small' | 'medium';
};

/**
 * "Mark completed" / "Reopen" — the doctor's end of the pipeline.
 *
 * The lab drives a case as far as SENT_TO_CLINIC; accepting it is the doctor's
 * call, because only the doctor knows whether the work actually seated. Both
 * transitions go through SECURITY DEFINER RPCs (0022): COMPLETED is terminal,
 * so no RLS policy can reach a completed row to reopen it.
 *
 * Shared by the doctor's and the clinic admin's order screens — a clinic admin
 * acts for their doctors here exactly as they do for edits and cancellations.
 *
 * A doctor's confirmation opens in `CompletionDialogHost` instead (mounted by
 * DoctorLayout), which follows a successful completion with the review step
 * (0044). The clinic admin keeps this plain dialog: only the doctor reviews.
 * A lab closing its own purchase from another lab (0048) reviews as a doctor
 * does: its purchase screens mount the same host.
 */
export function OrderCompletionActions({ orderId, status, size = 'small' }: Props) {
  const { t } = useTranslation('doctor');
  const qc = useQueryClient();
  const { user } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Completing changes what a doctor, a lab and a clinic each see, across list
  // screens, dashboards and receivables. It happens once per case, so a blanket
  // invalidation is cheaper than keeping a list of keys correct forever.
  const refetchEverything = () => qc.invalidateQueries();

  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('complete_order', { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirmOpen(false);
      refetchEverything();
    },
  });

  const reopen = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reopen_order', { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: refetchEverything,
  });

  if (status === 'COMPLETED') {
    return (
      <Button
        variant="outlined"
        size={size}
        startIcon={<Icon name="undo" size={16} />}
        disabled={reopen.isPending}
        onClick={() => reopen.mutate()}
      >
        {t('orderDetail.completion.reopen')}
      </Button>
    );
  }

  if (!canComplete(status)) return null;

  return (
    <>
      <Button
        variant="contained"
        color="success"
        size={size}
        startIcon={<Icon name="task_alt" size={16} />}
        onClick={() => {
          // The lab's only completable orders are its purchases (it cannot
          // complete an order it receives), whose screens mount the host.
          const reviews = user?.role === 'DOCTOR' || user?.role === 'LAB_MAIN_ADMIN';
          if (reviews && openCompletionDialog(orderId)) return;
          setConfirmOpen(true);
        }}
      >
        {t('orderDetail.completion.markCompleted')}
      </Button>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('orderDetail.completion.confirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('orderDetail.completion.confirmBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>
            {t('orderDetail.completion.cancel')}
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={complete.isPending}
            onClick={() => complete.mutate()}
          >
            {t('orderDetail.completion.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
