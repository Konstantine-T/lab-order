import { useState, type ReactNode } from 'react';
import { Box, Button, Stack, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { brand, palette2026, surfaces, tone } from '@/theme/tokens';
import type { OrderGroupKey } from './orderListModel';

export type GroupKey = OrderGroupKey | 'drafts';

/**
 * How many cards a group shows before "N more". The waiting-on-you group is
 * never cut — every card in it is something to do. Live stages show two rows
 * of the desktop grid; the archive groups only their newest few.
 */
const INITIAL: Record<GroupKey, number> = {
  drafts: Infinity,
  needsYou: Infinity,
  sent: 6,
  inProgress: 6,
  ready: 6,
  delivered: 6,
  completed: 3,
  cancelled: 3,
};

/** Each "N more" reveals at most this many — the list's paging. */
const STEP = 12;

/** The dot before each heading, in the redesign's colour story. */
function GroupDot({ group }: { group: GroupKey }) {
  const mode = useTheme().palette.mode;
  const base = { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box' } as const;
  switch (group) {
    case 'drafts':
      return <Box sx={{ ...base, border: '1.5px dashed', borderColor: surfaces[mode].textMuted }} />;
    case 'needsYou':
      return <Box sx={{ ...base, bgcolor: palette2026.gold }} />;
    case 'sent':
      return <Box sx={{ ...base, bgcolor: brand.soft }} />;
    case 'inProgress':
      return <Box sx={{ ...base, bgcolor: palette2026.aqua }} />;
    case 'ready':
      return (
        <Box
          sx={{ ...base, bgcolor: tone('success', mode).bg, border: '1.5px solid', borderColor: palette2026.aqua }}
        />
      );
    case 'delivered':
      return <Box sx={{ ...base, bgcolor: tone('info', mode).dot }} />;
    case 'completed':
      return <Box sx={{ ...base, bgcolor: 'text.primary' }} />;
    default:
      return <Box sx={{ ...base, bgcolor: surfaces[mode].textMuted }} />;
  }
}

/**
 * One group of the orders list: a heading with its count, then its cards in a
 * grid — three across on desktop, two on a tablet, one on a phone.
 *
 * Long groups show their first few and page in the rest with "N more", which
 * is what keeps a list of hundreds usable without a pager.
 */
export function OrderGroupSection<T>({
  group,
  items,
  renderItem,
  itemKey,
}: {
  group: GroupKey;
  items: T[];
  renderItem: (item: T) => ReactNode;
  itemKey: (item: T) => string;
}) {
  const { t } = useTranslation('common');
  const mode = useTheme().palette.mode;
  const initial = INITIAL[group];
  const [shown, setShown] = useState(initial);
  if (items.length === 0) return null;

  const visible = items.slice(0, shown);
  const remaining = items.length - visible.length;
  const headingId = `orders-group-${group}`;

  return (
    <Box component="section" aria-labelledby={headingId}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25, px: 0.25 }}>
        <GroupDot group={group} />
        <Typography id={headingId} component="h2" sx={{ fontSize: '0.8125rem', fontWeight: 700 }}>
          {t(`orderList.groups.${group}`)}
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>
          {items.length}
        </Typography>
      </Stack>

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
        {visible.map((item) => (
          <Box key={itemKey(item)} sx={{ minWidth: 0 }}>
            {renderItem(item)}
          </Box>
        ))}
      </Box>

      {(remaining > 0 || shown > initial) && (
        <Stack direction="row" justifyContent="center" spacing={1} sx={{ mt: 1 }}>
          {remaining > 0 && (
            <Button
              size="small"
              onClick={() => setShown((n) => n + STEP)}
              endIcon={<Icon name="arrow_downward" size={15} />}
              sx={{ fontWeight: 600, color: mode === 'light' ? palette2026.periText : brand.soft }}
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
    </Box>
  );
}
