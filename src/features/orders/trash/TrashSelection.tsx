import { useMemo, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { lift, radii } from '@/theme/tokens';
import type { OrderTrashSide } from '@/types/database';
import { invalidateAfterTrashChange, trashErrorKey, trashOrdersTracked } from './trashApi';
import { TrashConfirmDialog } from './TrashConfirmDialog';
import type { TrashKeeper } from './trashKeeper';
import type { OrderSelection } from './useOrderSelection';

/** "Select": opens select mode. Hidden while there is nothing finished to pick. */
export function SelectModeButton({
  selection,
  available,
}: {
  selection: OrderSelection;
  /** How many finished rows the list holds. */
  available: number;
}) {
  const { t } = useTranslation('common');
  if (selection.active || available === 0) return null;
  return (
    <Button
      size="small"
      color="inherit"
      onClick={selection.start}
      startIcon={<Icon name="checklist" size={16} />}
      sx={{ color: 'text.secondary', fontWeight: 600 }}
    >
      {t('trash.select.start')}
    </Button>
  );
}

/**
 * The select-mode action bar. Sticky at the foot of the viewport while the
 * list scrolls under it (above the phone tab bar), so "Move to trash" is in
 * reach however far down the last pick was.
 */
export function TrashSelectionBar({
  selection,
  side,
  selectableIds,
  keeperOf,
  onTrashed,
}: {
  selection: OrderSelection;
  side: OrderTrashSide;
  /** Finished rows the current filters show: what "Select all" picks. */
  selectableIds: string[];
  /** Who keeps the picked orders, for the confirm text. */
  keeperOf: (ids: string[]) => TrashKeeper;
  /** After a trash, the ids it really trashed (an order already gone on this
   *  side is not one): the page shows its toast with Undo. With `restErrorKey`
   *  when a later batch of a large selection was refused or failed: the ids
   *  are what moved before it, and the toast says the rest did not. */
  onTrashed: (ids: string[], restErrorKey?: string | null) => void;
}) {
  const { t } = useTranslation('common');
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // A pick that a filter or a refetch took off the list no longer counts.
  const selectable = useMemo(() => new Set(selectableIds), [selectableIds]);
  const picked = useMemo(
    () => [...selection.ids].filter((id) => selectable.has(id)),
    [selection.ids, selectable],
  );
  const allPicked = picked.length > 0 && picked.length === selectableIds.length;

  const trash = useMutation({
    mutationFn: (ids: string[]) => trashOrdersTracked(ids),
    // A refusal before anything moved throws, and the dialog shows it. Part
    // of a large selection moved: those get the toast and its Undo, and the
    // toast says why the rest did not.
    onSuccess: ({ trashedIds, error }) => {
      setConfirmOpen(false);
      selection.stop();
      onTrashed(trashedIds, error ? trashErrorKey(error) : null);
    },
    // A batch may have landed before a refusal: refresh either way.
    onSettled: (_data, _err, ids) => invalidateAfterTrashChange(qc, side, ids),
  });

  if (!selection.active) return null;

  return (
    <>
      <Box
        role="region"
        aria-label={t('trash.select.barLabel')}
        sx={{
          position: 'sticky',
          bottom: 'calc(var(--bottom-nav-height, 0px) + 12px)',
          zIndex: 30,
          mt: 2,
          px: { xs: 1.5, sm: 2 },
          py: 1.25,
          borderRadius: `${radii.card}px`,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          boxShadow: lift.card,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          sx={{ flexWrap: 'wrap', columnGap: 1, rowGap: 0.75 }}
        >
          <Box sx={{ minWidth: 0, mr: 'auto' }}>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700 }}>
              {t('trash.select.count', { count: picked.length })}
            </Typography>
            <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>
              {t('trash.select.hint')}
            </Typography>
          </Box>
          <Button
            size="small"
            color="inherit"
            disabled={selectableIds.length === 0}
            onClick={() => selection.setMany(allPicked ? [] : selectableIds)}
          >
            {allPicked
              ? t('trash.select.none')
              : t('trash.select.all', { count: selectableIds.length })}
          </Button>
          <Button size="small" color="inherit" onClick={selection.stop}>
            {t('actions.cancel')}
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            disabled={picked.length === 0}
            startIcon={<Icon name="delete" size={16} />}
            onClick={() => {
              trash.reset();
              setConfirmOpen(true);
            }}
          >
            {t('trash.select.move', { count: picked.length })}
          </Button>
        </Stack>
      </Box>
      <TrashConfirmDialog
        open={confirmOpen}
        count={picked.length}
        keeper={keeperOf(picked)}
        pending={trash.isPending}
        errorKey={trash.isError ? trashErrorKey(trash.error) : null}
        onConfirm={() => trash.mutate(picked)}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
