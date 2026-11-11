import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon, StatusPill } from '@/components/design';
import { LineageBadge } from '@/features/orders/LineageBadge';
import { InvoiceBadge } from '@/features/orders/orderFiles/InvoiceBadge';
import { LabInvoiceMark } from '@/features/lab/orders/LabInvoiceMark';
import { isAnswered, type LabListRow } from '@/features/lab/orders/labOrderList';
import { pastDate } from '../listFormat';
import { isEdited, type ListOrderRow } from '../orderListModel';

/** A dot and a word under the patient: waiting on the lab. */
function LabFlag({ children }: { children: ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main' }} />
      <Typography sx={{ fontSize: '0.625rem', fontWeight: 700, color: 'warning.dark' }} noWrap>
        {children}
      </Typography>
    </Stack>
  );
}

/** The queue's marks under the patient: an unconfirmed edit, an answer to
 *  read, an invoice uploaded. Shared by the lab's rows and cards. */
export function LabRowBadges({ row, invoiced }: { row: LabListRow; invoiced: boolean }) {
  const { t } = useTranslation('lab');
  return (
    <>
      {row.has_unreviewed_edits && <LabFlag>{t('editedOrders.unconfirmedBadge')}</LabFlag>}
      {/* Same treatment as an unreviewed edit: this order is waiting on the
          lab, not on the doctor. */}
      {isAnswered(row) && <LabFlag>{t('ordersDashboard.answeredBadge')}</LabFlag>}
      {invoiced && <LabInvoiceMark />}
    </>
  );
}

/** The card's pills under the patient, in a list row: what it continues, an
 *  unseen invoice, an edit under review or made. */
export function OrderRowBadges({
  row,
  invoiceUnseen,
  parentCode,
}: {
  row: ListOrderRow;
  invoiceUnseen?: boolean;
  parentCode?: string;
}) {
  const { t } = useTranslation('common');
  const edited = isEdited(row) || row.has_unreviewed_edits;
  if (!row.continues_order_id && !invoiceUnseen && !edited) return null;
  const editedAt = row.last_edited_at ? pastDate(row.last_edited_at, t) : null;
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.375 }}>
      <LineageBadge continuesOrderId={row.continues_order_id} parentCode={parentCode} />
      {invoiceUnseen && <InvoiceBadge />}
      {row.has_unreviewed_edits ? (
        <StatusPill tone="neutral">
          <Icon name="edit_note" size={13} />
          {t('orderList.editPending')}
        </StatusPill>
      ) : (
        edited && (
          <StatusPill tone="neutral">
            <Icon name="history" size={13} />
            {editedAt ? t('orderList.editedOn', { date: editedAt }) : t('orderList.quick.edited')}
          </StatusPill>
        )
      )}
    </Stack>
  );
}

/** What a lab order continues, under the patient in a lab row. */
export function LabLineage({ continuesOrderId, parentCode }: { continuesOrderId: string; parentCode?: string }) {
  return (
    <Box sx={{ mt: 0.375 }}>
      <LineageBadge continuesOrderId={continuesOrderId} parentCode={parentCode} />
    </Box>
  );
}
