import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CardStack,
  EmptyState,
  Icon,
  InitialsAvatar,
  MetaChip,
  PageHeader,
  SectionCard,
  StatusPill,
} from '@/components/design';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import type { AdminFeedbackListRow } from '@/types/database';
import { FEEDBACK_BUCKET } from '@/utils/feedbackImages';

/** Signed URLs are short-lived; refresh a little before they lapse so a long
 *  sitting on this page doesn't end with broken thumbnails. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFETCH_MS = 55 * 60 * 1000;

export function FeedbacksPage() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<AdminFeedbackListRow | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);

  const {
    data: items = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-feedback'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_feedback_list');
      if (error) throw error;
      return (data ?? []) as AdminFeedbackListRow[];
    },
  });

  // The bucket is private, so every attachment needs a signed URL. One batch
  // call for the whole page beats one request per thumbnail.
  const allPaths = items.flatMap((i) => i.image_paths ?? []);
  const { data: signedUrls = {} } = useQuery({
    queryKey: ['admin-feedback-images', allPaths],
    enabled: allPaths.length > 0,
    staleTime: SIGNED_URL_REFETCH_MS,
    refetchInterval: SIGNED_URL_REFETCH_MS,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(FEEDBACK_BUCKET)
        .createSignedUrls(allPaths, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const entry of data ?? []) {
        if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
      }
      return map;
    },
  });

  const remove = useMutation({
    mutationFn: async (item: AdminFeedbackListRow) => {
      // Storage first: if it fails we still have the row, and retrying the
      // delete retries both. Dropping the row first would orphan the images.
      if (item.image_paths?.length) {
        const { error: storageError } = await supabase.storage
          .from(FEEDBACK_BUCKET)
          .remove(item.image_paths);
        if (storageError) throw storageError;
      }
      const { error } = await supabase.from('feedback').delete().eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-feedback'] }),
    onError: () => setActionError(true),
  });

  return (
    <>
      <PageHeader title={t('feedbacks.title')} subtitle={t('feedbacks.subtitle')} />

      <CardStack>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {isError && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState icon="feedback" title={t('feedbacks.empty')} minHeight={220} />
      )}

      {items.map((item) => (
        <SectionCard key={item.id}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
              <InitialsAvatar
                name={`${item.first_name} ${item.last_name}`}
                size={36}
                shape="circle"
              />
              <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.84375rem', fontWeight: 700 }}>
                    {item.first_name} {item.last_name}
                  </Typography>
                  <StatusPill tone="brand">{tc(`roles.${item.role}`)}</StatusPill>
                  {item.org_name && (
                    <Typography variant="body1" color="text.secondary" noWrap>
                      {item.org_name}
                    </Typography>
                  )}
                </Stack>
                <Typography variant="body1" color="text.secondary">
                  {item.email}
                  {item.phone ? ` · ${item.phone}` : ''}
                </Typography>
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
              <Typography variant="caption" color="text.secondary" noWrap>
                {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
              </Typography>
              <Tooltip title={t('feedbacks.deleteAction')}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setDeleteTarget(item)}
                  aria-label={t('feedbacks.deleteAction')}
                >
                  <Icon name="delete" size={18} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          <Divider sx={{ my: 1.75 }} />

          <Typography
            variant="body1"
            sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6 }}
          >
            {item.message}
          </Typography>

          {item.image_paths?.length > 0 && (
            <Stack direction="row" sx={{ mt: 1.75, flexWrap: 'wrap', gap: 1 }}>
              {item.image_paths.map((path) => {
                const url = signedUrls[path];
                return (
                  <Box
                    key={path}
                    onClick={() => url && setLightbox(url)}
                    sx={{
                      width: 104,
                      height: 104,
                      borderRadius: '10px',
                      overflow: 'hidden',
                      border: 1,
                      borderColor: 'divider',
                      bgcolor: 'background.default',
                      cursor: url ? 'zoom-in' : 'default',
                      flexShrink: 0,
                    }}
                  >
                    {url && (
                      <Box
                        component="img"
                        src={url}
                        alt={t('feedbacks.attachment')}
                        loading="lazy"
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    )}
                  </Box>
                );
              })}
            </Stack>
          )}

          <Stack direction="row" sx={{ mt: 1.75, flexWrap: 'wrap', gap: 0.75 }}>
            {item.page_path && (
              <MetaChip icon={<Icon name="link" size={13} />}>
                {t('feedbacks.sentFrom')}: {item.page_path}
              </MetaChip>
            )}
            {item.lang && (
              <MetaChip icon={<Icon name="language" size={13} />}>{item.lang}</MetaChip>
            )}
          </Stack>
        </SectionCard>
      ))}

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('feedbacks.deleteConfirmTitle')}</DialogTitle>
        <DialogContent>
          {deleteTarget && (
            <Typography>
              {t('feedbacks.deleteConfirmBody', {
                name: `${deleteTarget.first_name} ${deleteTarget.last_name}`,
              })}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{tc('actions.cancel')}</Button>
          <Button
            color="error"
            variant="contained"
            disabled={remove.isPending}
            onClick={async () => {
              if (deleteTarget) {
                await remove.mutateAsync(deleteTarget).catch(() => {});
              }
              setDeleteTarget(null);
            }}
          >
            {t('feedbacks.deleteAction')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!lightbox} onClose={() => setLightbox(null)} maxWidth="lg">
        <Box
          component="img"
          src={lightbox ?? undefined}
          alt={t('feedbacks.attachment')}
          onClick={() => setLightbox(null)}
          sx={{
            display: 'block',
            maxWidth: '90vw',
            maxHeight: '85vh',
            cursor: 'zoom-out',
          }}
        />
      </Dialog>

      <Snackbar
        open={actionError}
        autoHideDuration={5000}
        onClose={() => setActionError(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setActionError(false)} variant="filled">
          {tc('errors.generic')}
        </Alert>
      </Snackbar>
      </CardStack>
    </>
  );
}
