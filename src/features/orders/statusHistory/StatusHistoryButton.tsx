import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/design';
import { OrderStatusChip } from '@/components/OrderStatusChip';
import type { StatusSide } from '@/features/orders/statusLabel';
import type { OrderStatusHistoryRow } from '@/types/database';

/**
 * When 0052 went live: an order placed before it has only its creation,
 * completion and cancellation in its history (reconstructed, `backfilled`).
 */
const STATUS_HISTORY_SINCE = '2026-10-26';

/** liveQueries maps `order_status_history` rows onto this key. */
const statusHistoryKey = (orderId: string) => ['order-status-history', orderId] as const;

/** "Lab: Dens Lab", "Doctor: Irakli K…", "Platform", "Automatic"; null when unknown. */
function actorText(row: OrderStatusHistoryRow, t: TFunction): string | null {
  // A reconstructed row with nobody recorded: say nothing rather than "Automatic".
  if (row.actor_role === 'SYSTEM' && row.backfilled) return null;
  const role = t(`statusHistory.role.${row.actor_role}`);
  if (row.actor_role === 'ADMIN' || row.actor_role === 'SYSTEM') return role;
  return row.actor_name ? `${role}: ${row.actor_name}` : role;
}

function HistoryList({ orderId, side }: { orderId: string; side: StatusSide }) {
  const { t } = useTranslation('common');
  const { data: rows, isLoading, isError } = useQuery({
    queryKey: statusHistoryKey(orderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_status_history')
        .select('*')
        .eq('order_id', orderId)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderStatusHistoryRow[];
    },
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  if (isError) return <Alert severity="error">{t('errors.loadFailed')}</Alert>;
  if (!rows?.length) {
    return <Typography color="text.secondary">{t('statusHistory.empty')}</Typography>;
  }

  return (
    <Stack spacing={0}>
      {rows.map((r, i) => {
        const who = actorText(r, t);
        return (
          <Stack
            key={r.id}
            spacing={0.5}
            sx={{ py: 1.25, borderTop: i === 0 ? 0 : 1, borderColor: 'divider' }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              <OrderStatusChip status={r.to_status} side={side} />
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                {dayjs(r.changed_at).format('YYYY-MM-DD HH:mm')}
              </Typography>
            </Stack>
            {who && <Typography sx={{ fontSize: '0.8125rem', overflowWrap: 'anywhere' }}>{who}</Typography>}
            {r.note && (
              <Typography
                sx={{ fontSize: '0.8125rem', color: 'text.secondary', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
              >
                {t('statusHistory.reason', { reason: r.note })}
              </Typography>
            )}
          </Stack>
        );
      })}
      {rows.some((r) => r.backfilled) && (
        <Typography sx={{ pt: 1.5, fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.5 }}>
          {t('statusHistory.backfilled', { date: STATUS_HISTORY_SINCE })}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * "Show status history" (0052): every status the order has had, newest first,
 * with who set it. A dialog on a desktop, a bottom sheet on a phone; the rows
 * load when it opens and follow the other side's changes live (liveQueries).
 * `side` labels the statuses as the reader's screens do (statusLabel).
 */
export function StatusHistoryButton({ orderId, side }: { orderId: string; side: StatusSide }) {
  const { t } = useTranslation('common');
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const title = (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography component="h2" sx={{ fontSize: '1rem', fontWeight: 700, flex: 1 }}>
        {t('statusHistory.title')}
      </Typography>
      <IconButton size="small" onClick={close} aria-label={t('actions.close')}>
        <Icon name="close" size={20} />
      </IconButton>
    </Stack>
  );

  return (
    <>
      <Button size="small" startIcon={<Icon name="history" size={16} />} onClick={() => setOpen(true)}>
        {t('statusHistory.show')}
      </Button>

      {phone ? (
        <Drawer
          anchor="bottom"
          open={open}
          onClose={close}
          PaperProps={{
            role: 'dialog',
            'aria-label': t('statusHistory.title'),
            sx: { borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '85vh' },
          }}
        >
          <Box sx={{ px: 2, pt: 1.75, pb: 1, borderBottom: 1, borderColor: 'divider' }}>{title}</Box>
          <Box sx={{ px: 2, pb: 3, overflowY: 'auto' }}>
            {open && <HistoryList orderId={orderId} side={side} />}
          </Box>
        </Drawer>
      ) : (
        <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>{open && <HistoryList orderId={orderId} side={side} />}</DialogContent>
        </Dialog>
      )}
    </>
  );
}
