import { useState } from 'react';
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { ReviewForm } from './ReviewForm';
import { emptyReviewDraft, reviewDraftError, type ReviewDraft } from './reviewDraft';
import { reviewErrorText } from './reviewErrors';
import { invalidateReviews } from './reviewQueries';

/**
 * The review form as the inside of a dialog: title, the lab and service it is
 * about, the fields, and the two buttons. Used by the completion dialog's
 * second step ("Skip" / "Submit review") and by the order page's own review
 * dialog ("Cancel" / "Save"), so the two can never drift apart.
 */
export function ReviewStep({
  orderId,
  labId,
  initial,
  title,
  subtitle,
  cancelLabel,
  submitLabel,
  onCancel,
  onSaved,
}: {
  orderId: string;
  labId?: string;
  initial?: ReviewDraft;
  title: string;
  /** "Lab name · Service", under the title. */
  subtitle?: string;
  cancelLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t: te } = useTranslation('errors');
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ReviewDraft>(initial ?? emptyReviewDraft);
  const [tried, setTried] = useState(false);

  const save = useMutation({
    mutationFn: async (d: ReviewDraft) => {
      const comment = d.comment.trim();
      const { error } = await supabase.rpc('save_lab_review', {
        p_order_id: orderId,
        p_rating: d.rating,
        p_comment: comment || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateReviews(qc, { orderId, labId });
      onSaved();
    },
  });

  const submit = () => {
    setTried(true);
    if (draft.rating === null || reviewDraftError(draft)) return;
    save.mutate(draft);
  };

  return (
    <>
      <DialogTitle sx={{ pb: subtitle ? 0.5 : undefined }}>{title}</DialogTitle>
      <DialogContent>
        {subtitle && (
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 2.25, overflowWrap: 'anywhere' }}>
            {subtitle}
          </Typography>
        )}
        <ReviewForm value={draft} onChange={setDraft} showErrors={tried} disabled={save.isPending} />
        {save.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {reviewErrorText(save.error, te)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.25, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onCancel} disabled={save.isPending}>
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={draft.rating === null || save.isPending}
        >
          {submitLabel}
        </Button>
      </DialogActions>
    </>
  );
}
