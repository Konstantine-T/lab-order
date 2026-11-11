import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Checkbox, Stack, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { type Column, DataRow, DataTable, Icon } from '@/components/design';
import { DARK, palette2026, surfaces } from '@/theme/tokens';
import type { OrderSort } from '@/features/orders/orderDates';
import { GroupDot } from '../OrderGroupSection';
import { INITIAL, STEP } from '../groupPaging';
import { GROUP_ORDER, groupRows, type ListOrderRow, type OrderGroupKey } from '../orderListModel';

/**
 * The orders list view, shared by every orders page (J4): one `DataTable`
 * whose rows each page builds from the shared cells (OrderRowCells) through a
 * row builder of its perspective (listRows.tsx). The card cues carry over:
 * a 3px left bar, gold when the order waits on the doctor and aqua when it is
 * ready, and the lab's highlight for an unreviewed edit or an answer.
 */

export type ListAccent = 'gold' | 'aqua';

/** One row, its cells in the columns' order. */
export type ListRow = {
  key: string;
  cells: ReactNode[];
  /** Opens the order, or toggles it in select mode; none = inert. */
  onOpen?: () => void;
  accent?: ListAccent | null;
  highlight?: boolean;
};

/** A select-mode row's checkbox: the row is the toggle, this shows its state. */
export function SelectCell({ checked, disabled, label }: { checked: boolean; disabled: boolean; label: string }) {
  return (
    <Checkbox
      checked={checked}
      disabled={disabled}
      size="small"
      tabIndex={-1}
      disableRipple
      inputProps={{ 'aria-label': label }}
      sx={{ p: 0, pointerEvents: 'none' }}
    />
  );
}

/** Buttons in a row: right-aligned, and neither a click nor a key on them
 *  opens the order. */
export function ActionsCell({ children }: { children?: ReactNode }) {
  if (!children) return <Box />;
  return (
    <Stack
      direction="row"
      spacing={0.75}
      justifyContent="flex-end"
      alignItems="center"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      sx={{
        minWidth: 0,
        flexWrap: 'wrap',
        rowGap: 0.5,
        // The card's buttons, at the row's size.
        '& .MuiButton-root': { whiteSpace: 'nowrap', minWidth: 0, flex: '0 0 auto' },
      }}
    >
      {children}
    </Stack>
  );
}

export function OrderListRow({ columns, row }: { columns: Column[]; row: ListRow }) {
  return (
    <DataRow
      columns={columns}
      onClick={row.onOpen}
      highlight={row.highlight}
      accent={row.accent ? palette2026[row.accent] : undefined}
    >
      {row.cells.map((cell, i) => (
        <Fragment key={i}>{cell}</Fragment>
      ))}
    </DataRow>
  );
}

/** The grid view's cards: three across on desktop, two on a tablet, one on a
 *  phone (GroupedOrderList's grid). */
export function OrderCardGrid({ children }: { children: ReactNode }) {
  return (
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
      {children}
    </Box>
  );
}

/** A list of rows with no groups: the lab's pages and a patient's history. */
export function OrderListTable({
  columns,
  rows,
  footer,
  minWidth,
}: {
  columns: Column[];
  rows: ListRow[];
  footer?: ReactNode;
  minWidth?: number;
}) {
  return (
    <DataTable columns={columns} footer={footer} minWidth={minWidth}>
      {rows.map((row) => (
        <OrderListRow key={row.key} columns={columns} row={row} />
      ))}
    </DataTable>
  );
}

/**
 * One group of the grouped list: a header row ("Waiting on you · 3"), its
 * rows, and the same "N more" paging the card grid uses (OrderGroupSection's
 * INITIAL / STEP), so the two views show the same orders. Nothing for an
 * empty group.
 */
function GroupRows({
  group,
  rows,
  columns,
  renderRow,
}: {
  group: OrderGroupKey;
  rows: ListOrderRow[];
  columns: Column[];
  renderRow: (row: ListOrderRow, group: OrderGroupKey) => ListRow;
}) {
  const { t } = useTranslation('common');
  const mode = useTheme().palette.mode;
  const initial = INITIAL[group];
  const [shown, setShown] = useState(initial);
  if (rows.length === 0) return null;
  const visible = rows.slice(0, shown);
  const remaining = rows.length - visible.length;

  return (
    <>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: 2.25,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: surfaces[mode].subtle,
        }}
      >
        <GroupDot group={group} />
        <Typography component="h2" sx={{ fontSize: '0.78125rem', fontWeight: 700 }}>
          {t('ordersView.groupHeader', { group: t(`orderList.groups.${group}`), count: rows.length })}
        </Typography>
      </Stack>
      {visible.map((row) => (
        <OrderListRow key={row.id} columns={columns} row={renderRow(row, group)} />
      ))}
      {(remaining > 0 || shown > initial) && (
        <Stack
          direction="row"
          justifyContent="center"
          spacing={1}
          sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}
        >
          {remaining > 0 && (
            <Button
              size="small"
              onClick={() => setShown((n) => n + STEP)}
              endIcon={<Icon name="arrow_downward" size={15} />}
              sx={{ fontWeight: 600, color: mode === 'light' ? palette2026.periText : DARK.periLight }}
            >
              {t('orderList.showMore', { count: Math.min(remaining, STEP) })}
            </Button>
          )}
          {shown > initial && (
            <Button
              size="small"
              color="inherit"
              onClick={() => setShown(initial)}
              endIcon={<Icon name="expand_less" size={15} />}
              sx={{ color: 'text.secondary' }}
            >
              {t('orderList.showLess')}
            </Button>
          )}
        </Stack>
      )}
    </>
  );
}

/**
 * The doctor's and the clinic's list view: GroupedOrderList's groups and
 * paging as one table. Drafts are not orders; they stay cards, above it.
 */
export function GroupedOrderTable({
  rows,
  sort,
  columns,
  renderRow,
  resetKey,
  drafts,
  minWidth,
}: {
  rows: ListOrderRow[];
  sort?: OrderSort;
  columns: Column[];
  renderRow: (row: ListOrderRow, group: OrderGroupKey) => ListRow;
  /** Changes when the filters do, folding every group back to its first page. */
  resetKey?: string;
  drafts?: ReactNode;
  minWidth?: number;
}) {
  const groups = useMemo(() => groupRows(rows, sort), [rows, sort]);
  const hasRows = GROUP_ORDER.some((g) => (groups.get(g)?.length ?? 0) > 0);
  return (
    <Stack spacing={2}>
      {drafts}
      {hasRows && (
        <DataTable columns={columns} minWidth={minWidth}>
          {GROUP_ORDER.map((group) => (
            <GroupRows
              key={`${group}|${resetKey}`}
              group={group}
              rows={groups.get(group) ?? []}
              columns={columns}
              renderRow={renderRow}
            />
          ))}
        </DataTable>
      )}
    </Stack>
  );
}
