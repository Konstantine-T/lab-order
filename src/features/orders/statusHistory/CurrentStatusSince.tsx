import { useEffect, useRef } from 'react';
import { Typography, type SxProps, type Theme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { OrderStatus } from '@/types/database';
import { actorText, HISTORY_TIME_FORMAT, useStatusHistory } from './useStatusHistory';

/**
 * "Status set 2026-11-10 14:32 · Clinic: Smile Clinic": when the order's
 * current status was set and by whom, under the status, without opening the
 * history (0052). It is the newest history row, shown only while that row is
 * the status the order has now: an order that moved before the history
 * existed (its newest row is an older status) shows nothing rather than a
 * wrong date.
 */
export function CurrentStatusSince({
  orderId,
  status,
  sx,
}: {
  orderId: string;
  status: OrderStatus;
  sx?: SxProps<Theme>;
}) {
  const { t } = useTranslation('common');
  const { data: rows, refetch, isFetching } = useStatusHistory(orderId);
  const latest = rows?.[0];
  const behind = !!latest && latest.to_status !== status;

  // The order moved (this tab saved it, or a refetch brought another side's
  // change) and the history has not caught up: ask once per status, so the
  // line follows without Realtime too. An order whose status predates the
  // history stays blank after that one ask.
  const askedFor = useRef<OrderStatus | null>(null);
  useEffect(() => {
    if (behind && !isFetching && askedFor.current !== status) {
      askedFor.current = status;
      void refetch();
    }
  }, [behind, isFetching, status, refetch]);

  if (!latest || behind) return null;
  const who = actorText(latest, t);
  const when = t('statusHistory.currentSet', {
    date: dayjs(latest.changed_at).format(HISTORY_TIME_FORMAT),
  });
  return (
    <Typography
      sx={[
        { fontSize: '0.8125rem', color: 'text.secondary', overflowWrap: 'anywhere' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {who ? `${when} · ${who}` : when}
    </Typography>
  );
}
