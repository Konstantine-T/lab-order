import { useState } from 'react';
import { Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { canTrash, type OrderStatus, type OrderTrashSide } from '@/types/database';
import { invalidateAfterTrashChange, trashErrorKey, trashOrders } from './trashApi';
import { TrashConfirmDialog } from './TrashConfirmDialog';
import type { TrashKeeper } from './trashKeeper';
import type { TrashedState } from './useTrashToast';

/**
 * "Move to trash" on one order's page (C1): the lab's sheet, the doctor's
 * order, the buying lab's purchase. Only for a finished order; the database
 * says the same (`order_not_finished`). After the confirm the list opens with
 * the toast and its Undo.
 */
export function MoveToTrashButton({
  orderId,
  status,
  side,
  keeper,
  listPath,
  size = 'medium',
}: {
  orderId: string;
  status: OrderStatus;
  side: OrderTrashSide;
  keeper: TrashKeeper;
  /** The list this order is in, where the toast shows. */
  listPath: string;
  size?: 'small' | 'medium';
}) {
  const { t } = useTranslation('common');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const trash = useMutation({
    mutationFn: () => trashOrders([orderId]),
    onSuccess: () => {
      invalidateAfterTrashChange(qc, side, [orderId]);
      setOpen(false);
      const state: TrashedState = { trashedOrderIds: [orderId] };
      navigate(listPath, { state });
    },
  });

  if (!canTrash(status)) return null;

  return (
    <>
      <Button
        variant="outlined"
        color="error"
        size={size}
        startIcon={<Icon name="delete" size={16} />}
        onClick={() => {
          trash.reset();
          setOpen(true);
        }}
      >
        {t('trash.moveToTrash')}
      </Button>
      <TrashConfirmDialog
        open={open}
        count={1}
        keeper={keeper}
        pending={trash.isPending}
        errorKey={trash.isError ? trashErrorKey(trash.error) : null}
        onConfirm={() => trash.mutate()}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
