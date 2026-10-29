import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';
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
  | { kind: 'moved'; ids: string[] }
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
    (ids: string[]) => {
      if (ids.length) setToast({ kind: 'moved', ids });
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

  const node = (
    <Snackbar
      open={open}
      // Keyed so a second trash restarts the timer instead of inheriting it.
      key={toast?.kind === 'moved' ? toast.ids.join(',') : toast?.kind}
      autoHideDuration={toast?.kind === 'moved' ? 8000 : 4000}
      onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {toast?.kind === 'error' ? (
        <Alert severity="error" variant="filled" onClose={() => setToast(null)}>
          {t(toast.key)}
        </Alert>
      ) : (
        <Alert
          severity="success"
          variant="filled"
          icon={false}
          onClose={toast?.kind === 'restored' ? () => setToast(null) : undefined}
          action={
            toast?.kind === 'moved' ? (
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
          {toast?.kind === 'moved'
            ? toast.ids.length === 1
              ? t('trash.toast.movedSingle')
              : t('trash.toast.movedMany', { count: toast.ids.length })
            : toast?.kind === 'restored'
              ? toast.count === 1
                ? t('trash.toast.restoredSingle')
                : t('trash.toast.restoredMany', { count: toast.count })
              : ''}
        </Alert>
      )}
    </Snackbar>
  );

  return { show, node };
}
