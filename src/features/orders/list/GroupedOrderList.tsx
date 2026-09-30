import { useMemo, type ReactNode } from 'react';
import { Box, Skeleton, Stack } from '@mui/material';
import type { OrderSort } from '@/features/orders/orderDates';
import { OrderGroupSection } from './OrderGroupSection';
import { GROUP_ORDER, groupRows, type ListOrderRow, type OrderGroupKey } from './orderListModel';

export type DraftItem = { key: string; node: ReactNode };

/**
 * The orders list as the redesign draws it on every screen size: stacked
 * groups — drafts, waiting on you, then each stage of the pipeline, then the
 * archive — each a grid of cards. Empty groups are left out.
 */
export function GroupedOrderList({
  rows,
  drafts = [],
  renderCard,
  resetKey,
  sort,
}: {
  /** Already filtered; grouped and sorted here. */
  rows: ListOrderRow[];
  /** How the cards inside each group are ordered; newest first when left out. */
  sort?: OrderSort;
  /** Unfinished orders, drawn first as their own group. */
  drafts?: DraftItem[];
  renderCard: (row: ListOrderRow, group: OrderGroupKey) => ReactNode;
  /** Changes when the filters do, folding every group back to its first page. */
  resetKey?: string;
}) {
  const groups = useMemo(() => groupRows(rows, sort), [rows, sort]);

  return (
    <Stack spacing={3.25}>
      <OrderGroupSection
        key={`drafts|${resetKey}`}
        group="drafts"
        items={drafts}
        itemKey={(d) => d.key}
        renderItem={(d) => d.node}
      />
      {GROUP_ORDER.map((group) => (
        <OrderGroupSection
          key={`${group}|${resetKey}`}
          group={group}
          items={groups.get(group) ?? []}
          itemKey={(row) => row.id}
          renderItem={(row) => renderCard(row, group)}
        />
      ))}
    </Stack>
  );
}

/** Card-shaped placeholders while the orders load, in the list's own grid. */
export function OrderListSkeleton() {
  return (
    <Stack spacing={1.25}>
      <Skeleton variant="text" width={140} height={22} />
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(3, minmax(0, 1fr))',
          },
        }}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={172} sx={{ borderRadius: '12px' }} />
        ))}
      </Box>
    </Stack>
  );
}
