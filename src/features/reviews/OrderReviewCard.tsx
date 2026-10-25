import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { Callout, Icon, SectionCard } from '@/components/design';
import { shortDate } from '@/features/orders/detail/format';
import { labNameOf, serviceNameOf } from '@/features/orders/detail/types';
import type { OrderRow } from '@/types/database';
import { ReviewItem } from './ReviewItem';
import { ReviewStep } from './ReviewStep';
import { reviewErrorText } from './reviewErrors';
import { invalidateReviews, isEdited } from './reviewQueries';
import { reviewDeadline, useOrderReview } from './orderReview';

/**
 * The "Review" card in the doctor's order rail (0044, B3):
 *
 *   - no review, completed, inside the 30 days → "Rate this order" and the
 *     deadline;
 *   - no review otherwise → nothing;
 *   - a review → it, with Edit and Delete, the lab's reply under it, and the
 *     platform's note when an admin hid it (editing does not unhide, J5).
 *
 * Doctor only: the clinic admin's order page does not render it (RLS would
 * not let the clinic read the review anyway).
 */
export function OrderReviewCard({ order }: { order: OrderRow }) {
  const { t } = useTranslation('doctor');
  const { t: te } = useTranslation('errors');
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: review, isLoading } = useOrderReview(order.id, order.doctor_id);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_lab_review', { p_review_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirmDelete(false);
      invalidateReviews(qc, { orderId: order.id, labId: order.lab_id });
    },
  });

  if (isLoading) return null;
  const deadline = reviewDeadline(order);
  if (!review && !deadline) return null;

  const labName = labNameOf(order);
  const service = serviceNameOf(order);
  const subtitle = [labName, service].filter(Boolean).join(' · ');

  const dialog = (
    <Dialog open={editing} onClose={() => setEditing(false)} maxWidth="sm" fullWidth>
      {editing && (
        <ReviewStep
          orderId={order.id}
          labId={order.lab_id}
          initial={review ? { rating: review.rating, comment: review.comment ?? '' } : undefined}
          title={review ? t('reviews.editTitle') : t('reviews.rateTitle')}
          subtitle={subtitle}
          cancelLabel={t('reviews.cancel')}
          submitLabel={review ? t('reviews.save') : t('reviews.submit')}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </Dialog>
  );

  if (!review) {
    return (
      <SectionCard icon="star" title={t('reviews.cardTitle')}>
        <Stack spacing={1}>
          <Button
            variant="contained"
            fullWidth
            startIcon={<Icon name="rate_review" size={18} />}
            onClick={() => setEditing(true)}
          >
            {t('reviews.rate')}
          </Button>
          {deadline && (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', textAlign: 'center' }}>
              {t('reviews.deadline', { date: shortDate(deadline.toISOString()) })}
            </Typography>
          )}
        </Stack>
        {dialog}
      </SectionCard>
    );
  }

  return (
    <SectionCard icon="star" title={t('reviews.yourReview')}>
      <Stack spacing={1.5}>
        {review.hidden_at && (
          <Callout tone="neutral" icon="visibility_off" title={t('reviews.hidden')}>
            {review.hidden_note && (
              <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
                {review.hidden_note}
              </Box>
            )}
          </Callout>
        )}
        <ReviewItem
          review={{ ...review, edited: isEdited(review) }}
          labName={labName}
          hideReviewer
        />
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Icon name="edit" size={16} />}
            onClick={() => setEditing(true)}
          >
            {t('reviews.edit')}
          </Button>
          <Button
            size="small"
            color="error"
            startIcon={<Icon name="delete" size={16} />}
            onClick={() => setConfirmDelete(true)}
          >
            {t('reviews.delete')}
          </Button>
        </Stack>
      </Stack>

      {dialog}

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('reviews.deleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('reviews.deleteBody')}</DialogContentText>
          {remove.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {reviewErrorText(remove.error, te)}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>
            {t('reviews.cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={remove.isPending}
            onClick={() => remove.mutate(review.id)}
          >
            {t('reviews.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </SectionCard>
  );
}
