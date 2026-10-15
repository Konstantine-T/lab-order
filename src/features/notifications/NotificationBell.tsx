import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { EmptyState, Icon } from '@/components/design';
import { radii, surfaces, tone } from '@/theme/tokens';
import type { NotificationRow } from '@/types/database';
import { useNotificationCenter } from './liveContext';
import { useNotificationList, useMarkRead } from './useNotifications';
import { notificationText, relativeTime } from './notificationText';

/**
 * The bell: an unread count on the icon, and the last 30 days of
 * notifications in a popover on a desktop or a full-width sheet on a phone.
 *
 * An event log, separate from the sidebar badges (J12): a badge says what is
 * waiting on you now and clears itself; a row here says what happened, and
 * stays until it is 30 days old.
 */
export function NotificationBell({
  size = 22,
  align = 'right',
}: {
  size?: number;
  /** Which edge of the bell the desktop popover lines up with: `left` in the
   *  lab/admin sidebar, so it opens over the page rather than off-screen. */
  align?: 'left' | 'right';
}) {
  const center = useNotificationCenter();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const { t } = useTranslation('common');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = !!anchor;

  // On a phone the sheet covers the page and lists every new row at the top,
  // so toasts stay away while it is open (owner decision). The desktop
  // popover leaves them alone.
  const holdToasts = center?.holdToasts;
  const sheetOpen = open && isPhone;
  useEffect(() => (sheetOpen && holdToasts ? holdToasts() : undefined), [sheetOpen, holdToasts]);

  if (!center) return null;
  const { unread } = center;
  const close = () => setAnchor(null);

  const button = (
    <Tooltip title={t('notifications.title')}>
      <IconButton
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={
          unread > 0
            ? t('notifications.openUnread', { n: unread > 99 ? '99+' : unread })
            : t('notifications.title')
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
      >
        <Badge
          badgeContent={unread}
          max={99}
          overlap="circular"
          sx={{
            '& .MuiBadge-badge': {
              bgcolor: tone('danger', theme.palette.mode).dot,
              color: 'common.white',
              fontSize: '0.625rem',
              fontWeight: 800,
              minWidth: 17,
              height: 17,
              px: 0.5,
              top: 3,
              right: 3,
            },
          }}
        >
          <Icon name="notifications" size={size} filled={open} />
        </Badge>
      </IconButton>
    </Tooltip>
  );

  const panel = <NotificationPanel onClose={close} phone={isPhone} />;

  return (
    <>
      {button}
      {isPhone ? (
        <Drawer
          anchor="bottom"
          open={open}
          onClose={close}
          PaperProps={{
            sx: {
              maxHeight: '86vh',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              backgroundImage: 'none',
              pb: 'env(safe-area-inset-bottom, 0px)',
            },
          }}
        >
          {open && panel}
        </Drawer>
      ) : (
        <Popover
          open={open}
          anchorEl={anchor}
          onClose={close}
          anchorOrigin={{ vertical: 'bottom', horizontal: align }}
          transformOrigin={{ vertical: 'top', horizontal: align }}
          slotProps={{
            paper: {
              sx: {
                width: 384,
                maxHeight: 'min(560px, calc(100vh - 96px))',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: `${radii.card}px`,
                backgroundImage: 'none',
                mt: 0.75,
              },
            },
          }}
        >
          {open && panel}
        </Popover>
      )}
    </>
  );
}

/** The bell's contents, shared by the popover and the sheet. */
export function NotificationPanel({ onClose, phone }: { onClose: () => void; phone: boolean }) {
  const center = useNotificationCenter();
  const { t } = useTranslation('common');
  const list = useNotificationList(center?.userId, true);
  const markRead = useMarkRead(center?.userId);
  if (!center) return null;

  const rows = list.rows;
  const anyUnread = center.unread > 0 || rows.some((r) => !r.read_at);

  return (
    <Box
      role="dialog"
      aria-label={t('notifications.title')}
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '100%' }}
    >
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ px: 2, pt: 1.5 }}>
        <Typography sx={{ fontSize: '0.96875rem', fontWeight: 700, flex: 1, minWidth: 0 }}>
          {t('notifications.title')}
        </Typography>
        <Tooltip title={center.muted ? t('notifications.unmute') : t('notifications.mute')}>
          <IconButton
            size="small"
            onClick={() => center.setMuted(!center.muted)}
            aria-label={center.muted ? t('notifications.unmute') : t('notifications.mute')}
            aria-pressed={center.muted}
            sx={{ color: 'text.secondary' }}
          >
            <Icon name={center.muted ? 'volume_off' : 'volume_up'} size={19} />
          </IconButton>
        </Tooltip>
        {phone && (
          <IconButton size="small" onClick={onClose} aria-label={t('actions.close')}>
            <Icon name="close" size={19} />
          </IconButton>
        )}
      </Stack>
      {/* Its own row: "ყველას წაკითხულად მონიშვნა" beside the title left the
          title a few letters wide. */}
      <Stack direction="row" justifyContent="flex-end" sx={{ px: 1.25, pb: 0.5 }}>
        <Button
          size="small"
          onClick={() => markRead.mutate(null)}
          disabled={!anyUnread}
          startIcon={<Icon name="done_all" size={17} />}
        >
          {t('notifications.markAllRead')}
        </Button>
      </Stack>
      <Divider />

      <Box sx={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
        {list.isLoading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 5 }}>
            <CircularProgress size={24} />
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState icon="notifications" title={t('notifications.empty')} minHeight={160} />
          </Box>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0.75 }}>
            {rows.map((row) => (
              <NotificationItem
                key={row.id}
                row={row}
                onOpen={() => {
                  onClose();
                  center.openNotification(row);
                }}
              />
            ))}
          </Box>
        )}
        {list.hasMore && (
          <Box sx={{ px: 2, pb: 1.5, pt: 0.5, display: 'flex', justifyContent: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void list.loadMore()}
              disabled={list.loadingMore}
            >
              {t('notifications.loadMore')}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function NotificationItem({ row, onOpen }: { row: NotificationRow; onOpen: () => void }) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const { t, i18n } = useTranslation('common');
  const { title, body } = notificationText(row, t, i18n);
  const unread = !row.read_at;

  return (
    <Box component="li">
      <ButtonBase
        onClick={onOpen}
        sx={{
          width: '100%',
          textAlign: 'left',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          gap: 1.25,
          px: 1.25,
          py: 1.125,
          borderRadius: `${radii.control}px`,
          bgcolor: unread ? surfaces[mode].subtle : 'transparent',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box
          aria-label={unread ? t('notifications.unread') : undefined}
          role={unread ? 'img' : undefined}
          sx={{
            mt: 0.75,
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: '50%',
            bgcolor: unread ? tone('brand', mode).dot : 'transparent',
          }}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{ fontSize: '0.8125rem', fontWeight: unread ? 700 : 500, lineHeight: 1.35 }}
          >
            {title}
          </Typography>
          {body && (
            <Typography sx={{ fontSize: '0.78125rem', color: 'text.secondary', lineHeight: 1.4 }}>
              {body}
            </Typography>
          )}
          <Typography
            component="time"
            dateTime={row.created_at}
            sx={{
              display: 'block',
              mt: 0.25,
              fontSize: '0.6875rem',
              color: surfaces[mode].textMuted,
            }}
          >
            {relativeTime(row.created_at, t)}
          </Typography>
        </Box>
      </ButtonBase>
    </Box>
  );
}
