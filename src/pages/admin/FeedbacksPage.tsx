import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    <Stack spacing={3}>
      <Typography variant="h4">{t('feedbacks.title')}</Typography>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {isError && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

      {!isLoading && !isError && items.length === 0 && (
        <Typography color="text.secondary">{t('feedbacks.empty')}</Typography>
      )}

      <Stack spacing={2}>
        {items.map((item) => (
          <Card key={item.id} variant="outlined">
            <CardContent>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
                spacing={2}
              >
                <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography fontWeight={600}>
                      {item.first_name} {item.last_name}
                    </Typography>
                    <Chip size="small" label={tc(`roles.${item.role}`)} />
                    <Typography variant="body2" color="text.secondary">
                      {item.org_name ?? '—'}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {item.email}
                    {item.phone ? ` · ${item.phone}` : ''}
                  </Typography>
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center">
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
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              <Typography sx={{ whiteSpace: 'pre-wrap' }}>{item.message}</Typography>

              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap">
                {item.page_path && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${t('feedbacks.sentFrom')}: ${item.page_path}`}
                  />
                )}
                {item.lang && <Chip size="small" variant="outlined" label={item.lang} />}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

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
    </Stack>
  );
}
