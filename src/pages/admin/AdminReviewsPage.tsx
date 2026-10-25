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
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import {
  CardStack,
  EmptyState,
  Icon,
  PageHeader,
  SectionCard,
  Segmented,
  StatusPill,
} from '@/components/design';
import { shortDateTime } from '@/features/orders/detail/format';
import { ReviewItem } from '@/features/reviews/ReviewItem';
import { reviewErrorText } from '@/features/reviews/reviewErrors';
import {
  REVIEW_COLUMNS,
  currentReport,
  invalidateReviews,
  isEdited,
} from '@/features/reviews/reviewQueries';
import type { LabReviewReportRow, LabReviewRow } from '@/types/database';

const PAGE = 20;
const NOTE_MAX = 1000;

type ReportLite = Pick<LabReviewReportRow, 'id' | 'reason' | 'created_at' | 'resolved_at' | 'resolution'>;
type AdminReview = LabReviewRow & {
  labs: { public_name: string } | null;
  lab_review_reports: ReportLite[];
};

type Tab = 'reported' | 'all';

/**
 * /admin/reviews (0044, E1). "Reported": the reviews labs reported, open
 * reports first. "All reviews": everything, newest first. Hide (with an
 * optional note the doctor and the lab see), unhide, or keep (closes the
 * report, the review stays). The sidebar badge counts the open reports.
 */
export function AdminReviewsPage() {
  const { t } = useTranslation('admin');
  const [tab, setTab] = useState<Tab>('reported');

  return (
    <>
      <PageHeader title={t('reviews.title')} subtitle={t('reviews.subtitle')} />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'reported', label: t('reviews.tabs.reported') },
          { value: 'all', label: t('reviews.tabs.all') },
        ]}
        sx={{ mb: 2, alignSelf: 'flex-start', width: 'fit-content', maxWidth: '100%' }}
      />
      {tab === 'reported' ? <ReportedList /> : <AllList />}
    </>
  );
}

const SELECT =
  `${REVIEW_COLUMNS}, labs(public_name), ` +
  'lab_review_reports(id, reason, created_at, resolved_at, resolution)';

/** How many resolved reports the Reported tab lists; older ones are under All. */
const RESOLVED_LIMIT = 200;

/**
 * Reviews with a report: open ones first (newest report first), then the rest.
 *
 * Read from the reports side, embedding each report's review. Every open
 * report is loaded, uncapped (at most one per review, and each is something
 * the admin still has to act on), so the list always matches the sidebar
 * badge, which counts every unresolved report. Only the resolved history is
 * capped, newest resolution first.
 */
function ReportedList() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['admin-review-reports'],
    queryFn: async () => {
      const embed = `lab_reviews(${SELECT})`;
      const [open, resolved] = await Promise.all([
        supabase.from('lab_review_reports').select(embed).is('resolved_at', null),
        supabase
          .from('lab_review_reports')
          .select(embed)
          .not('resolved_at', 'is', null)
          .order('resolved_at', { ascending: false })
          .limit(RESOLVED_LIMIT),
      ]);
      if (open.error) throw open.error;
      if (resolved.error) throw resolved.error;
      // A review reported several times appears once.
      const byId = new Map<string, AdminReview>();
      for (const row of [...(open.data ?? []), ...(resolved.data ?? [])] as unknown as {
        lab_reviews: AdminReview | null;
      }[]) {
        const r = row.lab_reviews;
        if (r && !byId.has(r.id)) byId.set(r.id, r);
      }
      const key = (r: AdminReview) => {
        const rep = currentReport(r.lab_review_reports);
        return { open: !!rep && !rep.resolved_at, at: rep?.resolved_at ?? rep?.created_at ?? '' };
      };
      return [...byId.values()].sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        if (ka.open !== kb.open) return ka.open ? -1 : 1;
        return kb.at.localeCompare(ka.at);
      });
    },
  });

  if (isLoading) return <Spinner />;
  if (isError) return <Alert severity="error">{tc('errors.loadFailed')}</Alert>;
  if (data.length === 0) return <EmptyState icon="flag" title={t('reviews.emptyReported')} minHeight={220} />;
  return (
    <CardStack>
      {data.map((r) => (
        <AdminReviewCard key={r.id} review={r} />
      ))}
    </CardStack>
  );
}

function AllList() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['admin-reviews'],
      initialPageParam: 0,
      queryFn: async ({ pageParam }) => {
        const { data, error } = await supabase
          .from('lab_reviews')
          .select(SELECT)
          .order('created_at', { ascending: false })
          .order('id')
          .range(pageParam, pageParam + PAGE - 1);
        if (error) throw error;
        return (data ?? []) as unknown as AdminReview[];
      },
      getNextPageParam: (last, pages) =>
        last.length === PAGE ? pages.reduce((n, p) => n + p.length, 0) : undefined,
    });
  const rows = data?.pages.flat() ?? [];

  if (isLoading) return <Spinner />;
  if (isError) return <Alert severity="error">{tc('errors.loadFailed')}</Alert>;
  if (rows.length === 0) return <EmptyState icon="reviews" title={t('reviews.emptyAll')} minHeight={220} />;
  return (
    <CardStack>
      {rows.map((r) => (
        <AdminReviewCard key={r.id} review={r} />
      ))}
      {hasNextPage && (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Button variant="outlined" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {t('reviews.showMore')}
          </Button>
        </Box>
      )}
    </CardStack>
  );
}

function Spinner() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress />
    </Box>
  );
}

function AdminReviewCard({ review }: { review: AdminReview }) {
  const { t } = useTranslation('admin');
  const { t: te } = useTranslation('errors');
  const qc = useQueryClient();
  const [hiding, setHiding] = useState(false);
  const report = currentReport(review.lab_review_reports);
  const open = !!report && !report.resolved_at;
  const labName = review.labs?.public_name ?? '';

  const moderate = useMutation({
    mutationFn: async ({ action, note }: { action: 'HIDE' | 'UNHIDE' | 'KEEP'; note?: string }) => {
      const { error } = await supabase.rpc('moderate_lab_review', {
        p_review_id: review.id,
        p_action: action,
        p_note: note?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setHiding(false);
      invalidateReviews(qc, { orderId: review.order_id, labId: review.lab_id });
    },
  });

  const badges = (
    <>
      {review.hidden_at && <StatusPill tone="neutral">{t('reviews.state.hidden')}</StatusPill>}
      {open && <StatusPill tone="warning">{t('reviews.state.open')}</StatusPill>}
      {!open && report?.resolution === 'KEPT' && <StatusPill tone="info">{t('reviews.state.kept')}</StatusPill>}
    </>
  );

  return (
    <SectionCard
      icon="store"
      title={labName}
      meta={report ? t('reviews.reportedAt', { date: shortDateTime(report.created_at) }) : undefined}
    >
      <Stack spacing={1.5}>
        <ReviewItem review={{ ...review, edited: isEdited(review) }} labName={labName} badges={badges} />

        {report && (
          <Box sx={{ p: 1.5, borderRadius: '10px', bgcolor: 'background.default', border: 1, borderColor: 'divider' }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', mb: 0.25 }}>
              {t('reviews.reason')}
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
              {report.reason}
            </Typography>
          </Box>
        )}

        {review.hidden_at && review.hidden_note && (
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', overflowWrap: 'anywhere' }}>
            {t('reviews.noteShown', { note: review.hidden_note })}
          </Typography>
        )}

        {moderate.isError && !hiding && (
          <Alert severity="error">{reviewErrorText(moderate.error, te)}</Alert>
        )}

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {review.hidden_at ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Icon name="visibility" size={16} />}
              disabled={moderate.isPending}
              onClick={() => moderate.mutate({ action: 'UNHIDE' })}
            >
              {t('reviews.unhide')}
            </Button>
          ) : (
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<Icon name="visibility_off" size={16} />}
              disabled={moderate.isPending}
              onClick={() => {
                moderate.reset();
                setHiding(true);
              }}
            >
              {t('reviews.hide')}
            </Button>
          )}
          {open && !review.hidden_at && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Icon name="check" size={16} />}
              disabled={moderate.isPending}
              onClick={() => moderate.mutate({ action: 'KEEP' })}
            >
              {t('reviews.keep')}
            </Button>
          )}
        </Stack>
      </Stack>

      <HideDialog
        open={hiding}
        pending={moderate.isPending}
        error={moderate.isError ? reviewErrorText(moderate.error, te) : null}
        onCancel={() => setHiding(false)}
        onHide={(note) => moderate.mutate({ action: 'HIDE', note })}
      />
    </SectionCard>
  );
}

function HideDialog({
  open,
  pending,
  error,
  onCancel,
  onHide,
}: {
  open: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onHide: (note: string) => void;
}) {
  const { t } = useTranslation('admin');
  const [note, setNote] = useState('');
  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onCancel}
      maxWidth="sm"
      fullWidth
      TransitionProps={{ onExited: () => setNote('') }}
    >
      <DialogTitle>{t('reviews.hideTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{t('reviews.hideBody')}</DialogContentText>
        <TextField
          multiline
          minRows={2}
          fullWidth
          label={t('reviews.hideNote')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          inputProps={{ maxLength: NOTE_MAX }}
          helperText={`${note.trim().length}/${NOTE_MAX}`}
          FormHelperTextProps={{ sx: { mx: 0 } }}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.25 }}>
        <Button onClick={onCancel} disabled={pending}>
          {t('reviews.cancel')}
        </Button>
        <Button color="error" variant="contained" disabled={pending} onClick={() => onHide(note)}>
          {t('reviews.confirmHide')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
