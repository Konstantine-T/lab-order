import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { labNameOf, serviceNameOf } from '@/features/orders/detail/types';
import { ReviewStep } from '@/features/reviews/ReviewStep';
import type { OrderRow } from '@/types/database';
import {
  closeCompletionDialog,
  useCompletionRequest,
  useRegisterCompletionHost,
} from './completionDialog';

type Step = 'confirm' | 'review';

/**
 * The doctor's completion dialog, mounted once by `DoctorLayout` (see
 * `completionDialog.ts` for why it is not owned by the button).
 *
 * Step 1 is the confirmation every role sees. Step 2 is the doctor's review
 * of the lab (0044, B2): "How was the work?", the lab and the service, the
 * form, then "Skip" (nothing saved; the order page keeps its "Rate this order"
 * button) or "Submit review".
 */
export function CompletionDialogHost() {
  useRegisterCompletionHost();
  const request = useCompletionRequest();
  const [step, setStep] = useState<Step>('confirm');
  const [shownFor, setShownFor] = useState<number | null>(null);

  // A new request always starts at the confirmation.
  if (request && request.nonce !== shownFor) {
    setShownFor(request.nonce);
    setStep('confirm');
  }

  return (
    <Dialog
      open={!!request}
      // A click outside cancels the confirmation, or skips the review.
      onClose={closeCompletionDialog}
      maxWidth={step === 'review' ? 'sm' : 'xs'}
      fullWidth
    >
      {request && (
        <CompletionFlow
          key={request.nonce}
          orderId={request.orderId}
          step={step}
          onCompleted={() => setStep('review')}
        />
      )}
    </Dialog>
  );
}

function CompletionFlow({
  orderId,
  step,
  onCompleted,
}: {
  orderId: string;
  step: Step;
  onCompleted: () => void;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();

  // The lab and service the review step names, from the order's snapshots.
  const { data: order } = useQuery({
    queryKey: ['order-review-context', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, lab_id, lab_snapshot, service_snapshot')
        .eq('id', orderId)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<OrderRow, 'id' | 'lab_id' | 'lab_snapshot' | 'service_snapshot'> | null;
    },
  });

  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('complete_order', { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => {
      // As before: completing moves what every role sees, once per case.
      void qc.invalidateQueries();
      onCompleted();
    },
  });

  if (step === 'review') {
    const subtitle = order
      ? [labNameOf(order as OrderRow), serviceNameOf(order as OrderRow)].filter(Boolean).join(' · ')
      : undefined;
    return (
      <ReviewStep
        orderId={orderId}
        labId={order?.lab_id}
        title={t('reviews.completionTitle')}
        subtitle={subtitle}
        cancelLabel={t('reviews.skip')}
        submitLabel={t('reviews.submit')}
        onCancel={closeCompletionDialog}
        onSaved={closeCompletionDialog}
      />
    );
  }

  return (
    <>
      <DialogTitle>{t('orderDetail.completion.confirmTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('orderDetail.completion.confirmBody')}</DialogContentText>
        {complete.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {tc('errors.generic')}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={closeCompletionDialog} disabled={complete.isPending}>
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
    </>
  );
}
