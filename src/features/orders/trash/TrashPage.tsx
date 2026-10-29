import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Snackbar, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyState, Icon, PageHeader, Pager } from '@/components/design';
import { OrderStatusChip } from '@/components/OrderStatusChip';
import { FromLabBadge } from '@/features/lab/orders/FromLabBadge';
import { radii } from '@/theme/tokens';
import {
  daysLeft,
  emptyTrash,
  invalidateAfterTrashChange,
  purgeTrashedOrders,
  restoreOrders,
  trashErrorKey,
  type TrashScope,
} from './trashApi';
import { PurgeConfirmDialog } from './TrashConfirmDialog';
import { TRASH_PAGE_SIZE, useTrashCount, useTrashList, type TrashListRow } from './trashQueries';

/** Who an order is with, seen from this side: the doctor or buying lab for a
 *  lab, the lab for a doctor or buying lab. */
function otherPartyOf(row: TrashListRow, side: TrashScope['side']): string {
  if (side === 'DOCTOR') return row.orders.lab_name?.trim() || '—';
  const d = row.orders.doctor_snapshot ?? {};
  return [d.first_name, d.last_name].filter(Boolean).join(' ').trim() || '—';
}

function patientOf(row: TrashListRow): string {
  const p = row.orders.patients;
  const name = p ? `${p.first_name} ${p.last_name}`.trim() : '';
  return name || row.orders.patient_reference?.trim() || '—';
}

/**
 * One side's trash (C2): `/lab/trash`, `/doctor/trash`, `/lab/purchases/trash`.
 * Each row restores, or is deleted from this side's list for good; "Empty
 * trash" does the latter for all of them. Nothing here touches the order, the
 * other side, the files or the money.
 *
 * Paged on the server (trashQueries.ts): the pager and "Empty trash" go by
 * the count of the whole trash, and "Empty trash" empties all of this side's
 * trash in one call, not only the page on screen.
 */
export function TrashPage({
  scope,
  ordersPath,
}: {
  /** Null while the session has no lab or buying profile: an empty trash. */
  scope: TrashScope | null;
  /** The list this trash belongs to; an order is `${ordersPath}/${id}`. */
  ordersPath: string;
}) {
  const { t } = useTranslation('common');
  const qc = useQueryClient();
  const side = scope?.side ?? 'DOCTOR';
  const [page, setPage] = useState(0);
  const total = useTrashCount(scope);
  // A restore or a purge can empty the last page: show the last one left.
  const pageCount = Math.max(1, Math.ceil(total / TRASH_PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const { data: rows = [], isLoading } = useTrashList(scope, current);
  const [purgeTarget, setPurgeTarget] = useState<'all' | string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  // What "Empty trash" deletes: the whole trash (a failed count reads 0, so
  // never less than the page on screen).
  const trashSize = Math.max(total, current * TRASH_PAGE_SIZE + rows.length);
  const empty = rows.length === 0 && (total === 0 || current === 0);

  const restore = useMutation({
    mutationFn: (ids: string[]) => restoreOrders(ids),
    onMutate: () => setErrorKey(null),
    onSuccess: () => setRestored(true),
    onError: (err) => setErrorKey(trashErrorKey(err)),
    onSettled: (_d, _e, ids) => invalidateAfterTrashChange(qc, side, ids),
  });

  // One order ("Delete now") by id; 'all' ("Empty trash") by side, on the
  // server, however much of the trash this page has loaded.
  const purge = useMutation({
    mutationFn: (target: 'all' | string) =>
      target === 'all' ? emptyTrash(side) : purgeTrashedOrders([target], side),
    onMutate: () => setErrorKey(null),
    onSuccess: () => setPurgeTarget(null),
    onSettled: (_d, _e, target) =>
      invalidateAfterTrashChange(qc, side, target === 'all' ? [] : [target]),
  });

  const keeper = side === 'LAB' ? 'customers' : 'lab';

  return (
    <>
      <PageHeader
        backTo={ordersPath}
        title={t('trash.page.title')}
        subtitle={`${t('trash.page.subtitle')} ${t(`trash.keeps.${keeper}.many`)}`}
        actions={
          !empty ? (
            <Button
              variant="outlined"
              color="error"
              startIcon={<Icon name="delete_sweep" size={17} />}
              onClick={() => {
                purge.reset();
                setPurgeTarget('all');
              }}
            >
              {t('trash.emptyTrash')}
            </Button>
          ) : undefined
        }
      />

      <Stack spacing={2}>
        {errorKey && (
          <Alert severity="error" onClose={() => setErrorKey(null)}>
            {t(errorKey)}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : empty ? (
          <EmptyState
            icon="delete"
            title={t('trash.empty.title')}
            description={t('trash.empty.description')}
            action={
              <Button component={RouterLink} to={ordersPath} size="small">
                {t('trash.backToOrders')}
              </Button>
            }
            minHeight={240}
          />
        ) : (
          <Box
            sx={{
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              borderRadius: `${radii.card}px`,
              overflow: 'hidden',
            }}
          >
            {rows.map((row) => {
              const days = daysLeft(row.purge_after);
              const busy =
                (restore.isPending && restore.variables?.includes(row.order_id)) ||
                (purge.isPending &&
                  (purge.variables === 'all' || purge.variables === row.order_id));
              return (
                <Stack
                  key={row.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  spacing={{ xs: 1.25, sm: 2 }}
                  sx={{
                    px: { xs: 1.75, sm: 2.25 },
                    py: 1.5,
                    borderBottom: 1,
                    borderColor: 'divider',
                    '&:last-of-type': { borderBottom: 0 },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
                      <Typography
                        component={RouterLink}
                        to={`${ordersPath}/${row.order_id}`}
                        sx={{
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          color: 'primary.dark',
                          textDecoration: 'none',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        {row.orders.order_code}
                      </Typography>
                      <OrderStatusChip
                        status={row.orders.status}
                        side={side === 'LAB' ? 'lab' : 'doctor'}
                      />
                      {side === 'LAB' && row.orders.buyer_lab_id && <FromLabBadge />}
                    </Stack>
                    <Typography
                      sx={{
                        fontSize: '0.8125rem',
                        color: 'text.secondary',
                        mt: 0.5,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {[patientOf(row), otherPartyOf(row, side), row.orders.service_name?.trim()]
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: days <= 2 ? 'warning.dark' : 'text.secondary',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t('trash.deletedIn', { count: days })}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      startIcon={<Icon name="restore_from_trash" size={16} />}
                      onClick={() => restore.mutate([row.order_id])}
                      sx={{ flex: { xs: 1, sm: 'none' } }}
                    >
                      {t('trash.restore')}
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      disabled={busy}
                      startIcon={<Icon name="delete_forever" size={16} />}
                      onClick={() => {
                        purge.reset();
                        setPurgeTarget(row.order_id);
                      }}
                      sx={{ flex: { xs: 1, sm: 'none' } }}
                    >
                      {t('trash.deleteNow')}
                    </Button>
                  </Stack>
                </Stack>
              );
            })}
            {pageCount > 1 && (
              <Stack
                direction="row"
                sx={{ px: 2.25, py: 1.5, borderTop: 1, borderColor: 'divider' }}
              >
                <Box sx={{ ml: 'auto' }}>
                  <Pager page={current} pageCount={pageCount} onChange={setPage} />
                </Box>
              </Stack>
            )}
          </Box>
        )}
      </Stack>

      <PurgeConfirmDialog
        open={purgeTarget !== null}
        all={purgeTarget === 'all'}
        count={purgeTarget === 'all' ? trashSize : 1}
        pending={purge.isPending}
        errorKey={purge.isError ? trashErrorKey(purge.error) : null}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
        onClose={() => setPurgeTarget(null)}
      />

      <Snackbar
        open={restored}
        autoHideDuration={4000}
        onClose={(_, reason) => reason !== 'clickaway' && setRestored(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setRestored(false)}>
          {t('trash.toast.restoredSingle')}
        </Alert>
      </Snackbar>
    </>
  );
}
