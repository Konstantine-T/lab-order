import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Snackbar } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { OrderTrashSide } from '@/types/database';
import { invalidateAfterTrashChange, restoreOrders, trashErrorKey } from './trashApi';

/**
 * Router state an order page hands its list after "Move to trash", so the
 * list shows the same toast, with Undo, as a bulk trash on the list does.
 */
export type TrashedState = { trashedOrderIds: string[] };

const trashedIdsOf = (state: unknown): string[] | null => {
  const ids = (state as { trashedOrderIds?: unknown } | null)?.trashedOrderIds;
  return Array.isArray(ids) && ids.length > 0 && ids.every((x) => typeof x === 'string')
    ? (ids as string[])
    : null;
};

type Toast =
  /** `restErrorKey`: a large selection stopped part way; `ids` moved.
   *  `unsure`: more orders moved that Undo cannot name (TrashOutcome). */
  | { kind: 'moved'; ids: string[]; restErrorKey?: string | null; unsure?: number }
  | { kind: 'restored'; count: number }
  | { kind: 'error'; key: string };

/**
 * "Moved to the trash" with Undo (restore_orders), for a list page. Also
 * picks up an order page's hand-over (`TrashedState`) and clears it from the
 * history entry, so Back or a reload does not toast again.
 */
export function useTrashToast(side: OrderTrashSide) {
  const { t } = useTranslation('common');
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  // Kept after closing, so the exit fade still shows what it said.
  const [toast, setToastState] = useState<Toast | null>(null);
  const [open, setOpen] = useState(false);
  const setToast = useCallback((next: Toast | null) => {
    if (next) setToastState(next);
    setOpen(!!next);
  }, []);

  const show = useCallback(
    (ids: string[], restErrorKey?: string | null, unsure = 0) => {
      if (ids.length || unsure > 0) setToast({ kind: 'moved', ids, restErrorKey, unsure });
    },
    [setToast],
  );

  useEffect(() => {
    const ids = trashedIdsOf(location.state);
    if (!ids) return;
    show(ids);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    // Only a new navigation carries a hand-over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const undo = useMutation({
    mutationFn: (ids: string[]) => restoreOrders(ids),
    onSuccess: (count, ids) => setToast({ kind: 'restored', count: count || ids.length }),
    onError: (err) => setToast({ kind: 'error', key: trashErrorKey(err) }),
    onSettled: (_data, _err, ids) => invalidateAfterTrashChange(qc, side, ids),
  });

  const close = (_: unknown, reason?: string) => {
    // A click elsewhere on the page must not take the Undo away.
    if (reason === 'clickaway') return;
    setToast(null);
  };

  // A large selection that stopped part way also says why the rest did not move.
  const restKey = toast?.kind === 'moved' ? toast.restErrorKey : null;
  const unsure = toast?.kind === 'moved' ? (toast.unsure ?? 0) : 0;
  // Undo brings back what it can name; orders it cannot, the trash page can.
  const canUndo = toast?.kind === 'moved' && toast.ids.length > 0;
  const moved = toast?.kind === 'moved' ? toast.ids.length + unsure : 0;
  const unsureText =
    unsure === 0
      ? null
      : canUndo
        ? t('trash.toast.unsureSome')
        : moved === 1
          ? t('trash.toast.unsureAllSingle')
          : t('trash.toast.unsureAllMany');
  const text =
    toast?.kind === 'moved'
      ? restKey
        ? t('trash.toast.movedPartial', { count: moved })
        : moved === 1
          ? t('trash.toast.movedSingle')
          : t('trash.toast.movedMany', { count: moved })
      : toast?.kind === 'restored'
        ? toast.count === 1
          ? t('trash.toast.restoredSingle')
          : t('trash.toast.restoredMany', { count: toast.count })
        : '';

  const node = (
    <Snackbar
      open={open}
      // Keyed so a second trash restarts the timer instead of inheriting it.
      key={toast?.kind === 'moved' ? `${toast.ids.join(',')}+${unsure}` : toast?.kind}
      // A partial move stays longer: it also says what did not happen.
      autoHideDuration={toast?.kind === 'moved' ? (restKey || unsure ? 15000 : 8000) : 4000}
      onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {toast?.kind === 'error' ? (
        <Alert severity="error" variant="filled" onClose={() => setToast(null)}>
          {t(toast.key)}
        </Alert>
      ) : (
        <Alert
          severity={restKey || unsure ? 'warning' : 'success'}
          variant="filled"
          icon={false}
          onClose={toast?.kind === 'moved' && canUndo ? undefined : () => setToast(null)}
          action={
            toast?.kind === 'moved' && canUndo ? (
              <Button
                color="inherit"
                size="small"
                disabled={undo.isPending}
                onClick={() => undo.mutate(toast.ids)}
                sx={{ fontWeight: 700 }}
              >
                {t('trash.toast.undo')}
              </Button>
            ) : undefined
          }
        >
          {text}
          {unsureText && (
            <Box component="span" sx={{ display: 'block', mt: 0.5, opacity: 0.9 }}>
              {unsureText}
            </Box>
          )}
          {restKey && (
            <Box component="span" sx={{ display: 'block', mt: 0.5, opacity: 0.9 }}>
              {t(restKey)}
            </Box>
          )}
        </Alert>
      )}
    </Snackbar>
  );

  return { show, node };
}
