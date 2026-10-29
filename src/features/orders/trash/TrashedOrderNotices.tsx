import { Alert, Button, Stack } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Callout, EmptyState, Icon, PageHeader } from '@/components/design';
import type { OrderTrashSide } from '@/types/database';
import { invalidateAfterTrashChange, restoreOrders, trashErrorKey } from './trashApi';

/**
 * C3, in the trash: the order page opens read-only under this banner, with
 * Restore. "This order is in the trash. It will be deleted from your list on
 * {{date}}."
 */
export function TrashedOrderBanner({
  orderId,
  side,
  purgeAfter,
}: {
  orderId: string;
  side: OrderTrashSide;
  purgeAfter: string;
}) {
  const { t } = useTranslation('common');
  const qc = useQueryClient();
  const restore = useMutation({
    mutationFn: () => restoreOrders([orderId]),
    onSettled: () => invalidateAfterTrashChange(qc, side, [orderId]),
  });

  return (
    <Stack spacing={1} sx={{ mb: 2.25 }}>
      <Callout
        tone="warning"
        icon="delete"
        title={t('trash.banner.inTrash', {
          date: dayjs(purgeAfter).format(t('orderList.dateFormatYear')),
        })}
        action={
          <Button
            variant="contained"
            size="small"
            disabled={restore.isPending}
            onClick={() => restore.mutate()}
            startIcon={<Icon name="restore_from_trash" size={16} />}
            sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {t('trash.restore')}
          </Button>
        }
      />
      {restore.isError && <Alert severity="error">{t(trashErrorKey(restore.error))}</Alert>}
    </Stack>
  );
}

/**
 * C3, gone: not the order, only this. "Gone for good" means gone for this
 * side; the other side still has it.
 */
export function OrderGoneNotice({
  ordersPath,
  ordersLabel,
}: {
  ordersPath: string;
  ordersLabel: string;
}) {
  const { t } = useTranslation('common');
  return (
    <>
      <PageHeader title={ordersLabel} backTo={ordersPath} />
      <EmptyState
        icon="delete_forever"
        title={t('trash.gone.title')}
        description={t('trash.gone.description')}
        action={
          <Button component={RouterLink} to={ordersPath} variant="contained">
            {t('trash.backToOrders')}
          </Button>
        }
        minHeight={260}
      />
    </>
  );
}
