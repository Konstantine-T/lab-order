import type { ReactNode } from 'react';
import { Typography } from '@mui/material';
import type { Column } from '@/components/design';
import {
  CustomerCell,
  DueCell,
  GoCell,
  OrderCodeCell,
  OrderStatusCell,
  PatientCell,
  TextCell,
  TotalCell,
} from '@/features/orders/table/OrderRowCells';
import { isLabPurchase, patientLabel } from '@/features/lab/orders/labCustomer';
import { destinationLabelOf } from '@/features/lab/orders/queueFilters';
import { isAnswered, labServiceName, type LabListRow } from '@/features/lab/orders/labOrderList';
import type { QueueDates } from '@/features/lab/orders/orderPresets';
import { formatGEL } from '@/utils/pricing';
import type { CardSelect } from '../OrderCard';
import {
  groupOf,
  labNameOf,
  patientFullName,
  priceOf,
  serviceNameOf,
  type ListOrderRow,
  type OrderGroupKey,
} from '../orderListModel';
import { ActionsCell, SelectCell, type ListRow } from './OrderListTable';
import { LabLineage, LabRowBadges, OrderRowBadges } from './RowBadges';

/**
 * The list view's columns and rows for each perspective, from the shared cells
 * (OrderRowCells), so every page's list is the lab queue's row (J4):
 *
 *   lab     code, patient, customer (doctor or lab), service, due, status, total, ›
 *   doctor  code, patient, lab, service, due, status, total, actions
 *   clinic  code, patient, doctor, lab, service, due, status, total, actions
 *
 * Column labels come from `common:orderList.columns`.
 */

type Labelled = { t: (key: string) => string };

/** Select mode's checkbox column (0054), in front of the rest. */
export const SELECT_COLUMN: Column = { key: 'select', width: '28px' };

const withLabels = (cols: Column[], { t }: Labelled, select: boolean): Column[] => [
  ...(select ? [SELECT_COLUMN] : []),
  ...cols.map((c) =>
    c.key === 'go' || c.key === 'actions' ? c : { ...c, label: t(`orderList.columns.${c.key}`) },
  ),
];

// ── Lab ─────────────────────────────────────────────────────────────────

const LAB_COLUMNS: Column[] = [
  { key: 'code', width: '92px' },
  { key: 'patient', width: 'minmax(0, 1.25fr)' },
  { key: 'doctor', width: 'minmax(0, 1fr)' },
  { key: 'service', width: 'minmax(0, 1.35fr)' },
  { key: 'due', width: '132px' },
  { key: 'status', width: '184px' },
  { key: 'total', width: '76px', align: 'right' },
  { key: 'go', width: '24px' },
];

export const labListColumns = (l: Labelled, select = false) => withLabels(LAB_COLUMNS, l, select);

/** The doctor, or the buying lab, as the lab knows them. */
export const labCustomerName = (row: Pick<LabListRow, 'doctor_snapshot'>) => {
  const ds = row.doctor_snapshot ?? {};
  return [ds.first_name, ds.last_name].filter(Boolean).join(' ') || '—';
};

export function labListRow(
  row: LabListRow,
  opts: {
    dates: QueueDates;
    invoiced: boolean;
    /** The queue's inline status select; a read-only pill otherwise. */
    statusCell?: ReactNode;
    onOpen?: () => void;
    /** Select mode (0054): the row's checkbox. */
    select?: { checked: boolean; disabled: boolean };
    /** Show what the order continues (pages that resolve parent codes). */
    lineage?: { parentCode: string | undefined };
  },
): ListRow {
  const place = destinationLabelOf(row);
  const total = row.final_total ?? row.generated_total;
  const cells: ReactNode[] = [
    <OrderCodeCell code={row.order_code} />,
    <PatientCell name={patientLabel(row)}>
      <LabRowBadges row={row} invoiced={opts.invoiced} />
      {opts.lineage && row.continues_order_id && (
        <LabLineage continuesOrderId={row.continues_order_id} parentCode={opts.lineage.parentCode} />
      )}
    </PatientCell>,
    // The destination under the doctor rather than as a ninth column: eight
    // is already dense at 1280px.
    <CustomerCell
      name={labCustomerName(row)}
      fromLab={isLabPurchase(row)}
      detail={place.clinic}
      detailTitle={[place.clinic, place.detail].filter(Boolean).join(' · ')}
    />,
    <TextCell>{labServiceName(row)}</TextCell>,
    <DueCell order={row} dates={opts.dates} side="lab" />,
    opts.statusCell ?? (
      <OrderStatusCell status={row.status} completedAt={row.completed_at} side="lab" />
    ),
    <Typography sx={{ fontSize: '0.78125rem', fontWeight: 700, textAlign: 'right' }}>
      {total != null ? formatGEL(total) : '—'}
    </Typography>,
    <GoCell />,
  ];
  if (opts.select) {
    cells.unshift(
      <SelectCell checked={opts.select.checked} disabled={opts.select.disabled} label={row.order_code} />,
    );
  }
  return {
    key: row.id,
    cells,
    onOpen: opts.onOpen,
    highlight: !!opts.select?.checked || row.has_unreviewed_edits || isAnswered(row),
  };
}

// ── Doctor and clinic ───────────────────────────────────────────────────

const DOCTOR_COLUMNS: Column[] = [
  { key: 'code', width: '92px' },
  { key: 'patient', width: 'minmax(0, 1.25fr)' },
  { key: 'lab', width: 'minmax(0, 1fr)' },
  { key: 'service', width: 'minmax(0, 1.25fr)' },
  { key: 'due', width: '132px' },
  { key: 'status', width: 'minmax(120px, auto)' },
  { key: 'total', width: '84px', align: 'right' },
  { key: 'actions', width: 'minmax(88px, auto)', align: 'right' },
];

const CLINIC_COLUMNS: Column[] = [
  ...DOCTOR_COLUMNS.slice(0, 2),
  { key: 'doctor', width: 'minmax(0, 1fr)' },
  ...DOCTOR_COLUMNS.slice(2),
];

export const orderListColumns = (perspective: 'doctor' | 'clinic', l: Labelled, select = false) =>
  withLabels(perspective === 'clinic' ? CLINIC_COLUMNS : DOCTOR_COLUMNS, l, select);

export function orderListRow(
  row: ListOrderRow,
  opts: {
    perspective: 'doctor' | 'clinic';
    /** The row's group, when the list is grouped; else derived. */
    group?: OrderGroupKey;
    dates: QueueDates;
    onOpen?: () => void;
    /** The clinic list: who the order was placed for. */
    doctorName?: string;
    invoiceUnseen?: boolean;
    parentCode?: string;
    /** The card's buttons. */
    actions?: ReactNode;
    /** Select mode (0054), as OrderCard takes it. */
    select?: CardSelect;
  },
): ListRow {
  const group = opts.group ?? groupOf(row);
  const patient = patientFullName(row) || row.patient_reference?.trim() || '—';
  const cells: ReactNode[] = [
    <OrderCodeCell code={row.order_code} />,
    <PatientCell name={patient}>
      <OrderRowBadges row={row} invoiceUnseen={opts.invoiceUnseen} parentCode={opts.parentCode} />
    </PatientCell>,
    ...(opts.perspective === 'clinic' ? [<TextCell>{opts.doctorName}</TextCell>] : []),
    <TextCell>{labNameOf(row)}</TextCell>,
    <TextCell>{serviceNameOf(row)}</TextCell>,
    <DueCell order={row} dates={opts.dates} side="doctor" />,
    <OrderStatusCell status={row.status} completedAt={row.completed_at} side="doctor" />,
    // A cancelled order owes nothing; its old estimate would read as a bill.
    <TotalCell price={row.status === 'CANCELLED' ? null : priceOf(row)} />,
    <ActionsCell>{opts.actions}</ActionsCell>,
  ];
  let onOpen = opts.onOpen;
  let checked = false;
  if (opts.select) {
    const pick = opts.select === 'off' ? null : opts.select;
    checked = !!pick?.checked;
    cells.unshift(<SelectCell checked={checked} disabled={!pick} label={row.order_code} />);
    onOpen = pick?.onToggle;
  }
  return {
    key: row.id,
    cells,
    onOpen,
    accent: group === 'needsYou' ? 'gold' : group === 'ready' ? 'aqua' : null,
    highlight: checked,
  };
}
