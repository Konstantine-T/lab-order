import { Box, Stack, Typography } from '@mui/material';
import { StatusPill } from '@/components/design';
import { PaymentStatusChip } from '@/components/OrderStatusChip';
import type { RowMoney } from '@/features/orders/list/view/listRows';
import { formatGEL } from '@/utils/pricing';

/**
 * A finances page's money under an order's card, below `md` (OrderCard's
 * `footer`): billed · paid · outstanding on one line, then the payment pill
 * and, past its date, the overdue one. The same figures as the table's money
 * cell; "Record payment" goes in the card's actions.
 */
export function FinanceMoneyLine({ money }: { money: RowMoney }) {
  const { labels } = money;
  const amount = (label: string, value: number, owed?: boolean) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }} noWrap>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.8125rem',
          fontWeight: owed ? 700 : 600,
          color: owed && value > 0 ? 'error.main' : 'text.primary',
          whiteSpace: 'nowrap',
        }}
      >
        {formatGEL(value)}
      </Typography>
    </Box>
  );

  return (
    // The card body's own gutter, under a hairline.
    <Box sx={{ px: 2, pb: 1.5 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 1,
          pt: 1.25,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        {amount(labels.billed, money.billed)}
        {amount(labels.paid, money.paid)}
        {amount(labels.outstanding, money.outstanding, true)}
      </Box>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
        <PaymentStatusChip status={money.paymentStatus} />
        {money.overdue && <StatusPill tone="danger">{money.overdue}</StatusPill>}
      </Stack>
    </Box>
  );
}
