import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Rating,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import {
  CardStack,
  EmptyState,
  Icon,
  PageHeader,
  SectionCard,
  StatusPill,
} from '@/components/design';
import { useLabText, useUiLang } from '@/features/lab/labText';
import { ReplyBlock, ReviewItem } from '@/features/reviews/ReviewItem';
import { starSx } from '@/features/reviews/reviewDraft';
import { formatAverage } from '@/features/reviews/rating';
import { useLabRating } from '@/features/reviews/useLabRating';
import { reviewErrorCode, reviewErrorText } from '@/features/reviews/reviewErrors';
import {
  REVIEW_COLUMNS,
  currentReport,
  invalidateReviews,
  isEdited,
  type LabPageReview,
} from '@/features/reviews/reviewQueries';

const PAGE = 20;
const REPLY_MAX = 2000;
const REASON_MAX = 1000;

/**
 * /lab/reviews (0044, D1): every review of the lab, newest first, hidden ones
 * included and marked. Per review the lab can write one public reply (and
 * edit or remove it), and report the review to the platform with a reason.
 * The order code links to the lab's own order sheet; the public never sees it.
 */
export function LabReviewsPage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const { labText } = useLabText();
  const lang = useUiLang();
  const labId = user?.lab?.id;
  const labName = user?.lab ? labText(user.lab, 'public_name') : '';
  const { data: rating } = useLabRating(labId);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['lab-reviews', labId],
      enabled: !!labId,
      initialPageParam: 0,
      queryFn: async ({ pageParam }) => {
        const { data, error } = await supabase
          .from('lab_reviews')
          .select(
            `${REVIEW_COLUMNS}, orders(order_code), ` +
              'lab_review_reports(id, reason, created_at, resolved_at, resolution)',
          )
          .eq('lab_id', labId!)
          .order('created_at', { ascending: false })
          .order('id')
          .range(pageParam, pageParam + PAGE - 1);
        if (error) throw error;
        return (data ?? []) as unknown as LabPageReview[];
      },
      getNextPageParam: (last, pages) =>
        last.length === PAGE ? pages.reduce((n, p) => n + p.length, 0) : undefined,
    });
  const reviews = data?.pages.flat() ?? [];
  const count = rating?.count ?? 0;

  return (
    <>
      <PageHeader title={t('reviews.title')} subtitle={t('reviews.subtitle')} />
      <CardStack>
        {/* Always shown here, whatever the count: it is the lab's own data. */}
        {count > 0 && rating?.average != null && (
          <SectionCard>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Typography sx={{ fontSize: '2.25rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>
                {formatAverage(rating.average, lang)}
              </Typography>
              <Stack spacing={0.25}>
                <Rating value={rating.average} precision={0.1} readOnly sx={starSx} aria-hidden />
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                  {t('reviews.count', { count })}
                </Typography>
              </Stack>
            </Stack>
          </SectionCard>
        )}

        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}
        {isError && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}
        {!isLoading && !isError && reviews.length === 0 && (
          <EmptyState icon="reviews" title={t('reviews.empty')} description={t('reviews.emptyHint')} minHeight={220} />
        )}

        {reviews.map((r) => (
          <LabReviewCard key={r.id} review={r} labName={labName} />
        ))}

        {hasNextPage && (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Button variant="outlined" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {t('reviews.showMore')}
            </Button>
          </Box>
        )}
      </CardStack>
    </>
  );
}

function LabReviewCard({ review, labName }: { review: LabPageReview; labName: string }) {
  const { t } = useTranslation('lab');
  const [reporting, setReporting] = useState(false);
  const report = currentReport(review.lab_review_reports);
  const open = !!report && !report.resolved_at;

  const badges = (
    <>
      {review.orders?.order_code && (
        <Link
          component={RouterLink}
          to={`/lab/orders/${review.order_id}`}
          underline="hover"
          sx={{ fontSize: '0.8125rem', fontWeight: 600 }}
        >
          {t('reviews.order', { code: review.orders.order_code })}
        </Link>
      )}
      {review.hidden_at && <StatusPill tone="neutral">{t('reviews.state.hidden')}</StatusPill>}
      {!review.hidden_at && open && <StatusPill tone="warning">{t('reviews.state.open')}</StatusPill>}
      {!review.hidden_at && !open && report?.resolution === 'KEPT' && (
        <StatusPill tone="info">{t('reviews.state.kept')}</StatusPill>
      )}
    </>
  );

  return (
    <SectionCard>
      <ReviewItem
        review={{ ...review, edited: isEdited(review) }}
        labName={labName}
        badges={badges}
        reply={<ReplyEditor review={review} labName={labName} />}
        footer={
          <>
            {review.hidden_at && review.hidden_note && (
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', overflowWrap: 'anywhere' }}>
                {t('reviews.hiddenNote', { note: review.hidden_note })}
              </Typography>
            )}
            {!open && !review.hidden_at && (
              <Box>
                <Button
                  size="small"
                  color="inherit"
                  startIcon={<Icon name="flag" size={16} />}
                  onClick={() => setReporting(true)}
                  sx={{ color: 'text.secondary' }}
                >
                  {t('reviews.report')}
                </Button>
              </Box>
            )}
          </>
        }
      />
      <ReportDialog review={review} open={reporting} onClose={() => setReporting(false)} />
    </SectionCard>
  );
}

/** The lab's one public reply: write, edit, remove (0044's reply_to_lab_review). */
function ReplyEditor({ review, labName }: { review: LabPageReview; labName: string }) {
  const { t } = useTranslation('lab');
  const { t: te } = useTranslation('errors');
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const save = useMutation({
    mutationFn: async (reply: string) => {
      const { error } = await supabase.rpc('reply_to_lab_review', {
        p_review_id: review.id,
        p_reply: reply,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(false);
      invalidateReviews(qc, { orderId: review.order_id, labId: review.lab_id });
    },
  });

  if (editing) {
    const length = text.trim().length;
    return (
      <Stack spacing={1} sx={{ ml: { xs: 1, sm: 2 } }}>
        <TextField
          multiline
          minRows={3}
          maxRows={10}
          fullWidth
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('reviews.replyPlaceholder')}
          disabled={save.isPending}
          inputProps={{ maxLength: REPLY_MAX, 'aria-label': t('reviews.replyPlaceholder') }}
          helperText={`${t('reviews.replyPublic')} ${length}/${REPLY_MAX}`}
          FormHelperTextProps={{ sx: { mx: 0 } }}
        />
        {save.isError && <Alert severity="error">{reviewErrorText(save.error, te)}</Alert>}
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            size="small"
            disabled={!text.trim() || save.isPending}
            onClick={() => save.mutate(text)}
          >
            {t('reviews.publishReply')}
          </Button>
          <Button size="small" onClick={() => setEditing(false)} disabled={save.isPending}>
            {t('reviews.cancel')}
          </Button>
        </Stack>
      </Stack>
    );
  }

  const start = () => {
    save.reset();
    setText(review.lab_reply ?? '');
    setEditing(true);
  };

  if (!review.lab_reply) {
    return (
      <Box>
        <Button size="small" variant="outlined" startIcon={<Icon name="forum" size={16} />} onClick={start}>
          {t('reviews.reply')}
        </Button>
      </Box>
    );
  }

  return (
    <Stack spacing={0.5}>
      <ReplyBlock labName={labName} text={review.lab_reply} at={review.lab_replied_at} />
      {save.isError && <Alert severity="error">{reviewErrorText(save.error, te)}</Alert>}
      <Stack direction="row" spacing={1} sx={{ ml: { xs: 1, sm: 2 } }}>
        <Button size="small" startIcon={<Icon name="edit" size={16} />} onClick={start}>
          {t('reviews.editReply')}
        </Button>
        <Button
          size="small"
          color="error"
          startIcon={<Icon name="delete" size={16} />}
          disabled={save.isPending}
          onClick={() => save.mutate('')}
        >
          {t('reviews.removeReply')}
        </Button>
      </Stack>
    </Stack>
  );
}

function ReportDialog({
  review,
  open,
  onClose,
}: {
  review: LabPageReview;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('lab');
  const { t: te } = useTranslation('errors');
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('report_lab_review', {
        p_review_id: review.id,
        p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateReviews(qc, { labId: review.lab_id });
      close();
    },
    // The admin hid the review while this dialog was open: refresh the list so
    // the card shows it hidden and drops its Report button.
    onError: (err) => {
      if (reviewErrorCode(err) === 'review_hidden') invalidateReviews(qc, { labId: review.lab_id });
    },
  });

  function close() {
    setReason('');
    setTried(false);
    send.reset();
    onClose();
  }

  const missing = tried && !reason.trim();

  return (
    <Dialog open={open} onClose={send.isPending ? undefined : close} maxWidth="sm" fullWidth>
      <DialogTitle>{t('reviews.reportTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{t('reviews.reportBody')}</DialogContentText>
        <TextField
          multiline
          minRows={3}
          fullWidth
          required
          autoFocus
          label={t('reviews.reportReason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={missing}
          disabled={send.isPending}
          inputProps={{ maxLength: REASON_MAX }}
          helperText={missing ? te('reviews.reason_required') : `${reason.trim().length}/${REASON_MAX}`}
          FormHelperTextProps={{ sx: { mx: 0 } }}
        />
        {send.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {reviewErrorText(send.error, te)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.25 }}>
        <Button onClick={close} disabled={send.isPending}>
          {t('reviews.cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={send.isPending}
          onClick={() => {
            setTried(true);
            if (reason.trim()) send.mutate();
          }}
        >
          {t('reviews.reportSubmit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
