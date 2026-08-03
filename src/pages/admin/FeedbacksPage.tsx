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

export function FeedbacksPage() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<AdminFeedbackListRow | null>(null);
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

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('feedback').delete().eq('id', id);
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
                await remove.mutateAsync(deleteTarget.id).catch(() => {});
              }
              setDeleteTarget(null);
            }}
          >
            {t('feedbacks.deleteAction')}
          </Button>
        </DialogActions>
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
