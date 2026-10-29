import { Box, Stack } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FactCell, SectionCard } from '@/components/design';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import { StatusHistoryButton } from '@/features/orders/statusHistory/StatusHistoryButton';
import { formatGEL } from '@/utils/pricing';
import type { OrderRow } from '@/types/database';

/**
 * The sheet's rail while the order is in this lab's trash (0054, C3): what the
 * editable cards would show, read-only. Restoring the order brings the
 * controls back.
 */
export function TrashedSheetRail({
  order,
}: {
  order: Pick<OrderRow, 'id' | 'status' | 'payment_status' | 'final_total' | 'paid_total'>;
}) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  return (
    <SectionCard title={t('orderSheet.statusTitle')} meta={tc('trash.readOnly')}>
      <Stack spacing={1.75}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <OrderStatusChip status={order.status} side="lab" />
          <PaymentStatusChip status={order.payment_status} />
        </Stack>
        <FactCell
          label={t('orderSheet.finalPriceLabel')}
          value={order.final_total != null ? formatGEL(order.final_total) : '—'}
        />
        <FactCell
          label={t('finances.dialog.amountLabel')}
          value={formatGEL(order.paid_total ?? 0)}
        />
        {/* Reading the history (0052) changes nothing: it stays. */}
        <Box>
          <StatusHistoryButton orderId={order.id} side="lab" />
        </Box>
      </Stack>
    </SectionCard>
  );
}
