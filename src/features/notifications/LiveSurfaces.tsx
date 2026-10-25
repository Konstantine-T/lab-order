import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Grow,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Callout, Icon } from '@/components/design';
import { lift, radii, surfaces, tone } from '@/theme/tokens';
import type { NotificationRow } from '@/types/database';
import { notificationText } from './notificationText';

const LIFETIME_MS = 6_000;

/**
 * Live notifications as toasts: bottom-left on a desktop, across the top on a
 * phone (where the bottom belongs to the tab bar and the price bar).
 *
 * At most three at once (the provider passes the first three; the rest wait
 * their turn). Each lives about six seconds, and the clock stops while the
 * pointer or keyboard focus is on it. One polite live region announces them.
 *
 * MUI Paper-style surfaces rather than `Snackbar`: Snackbar positions one
 * message per corner, and three would sit on top of each other.
 */
export function NotificationToasts({
  toasts,
  onOpen,
  onDismiss,
}: {
  toasts: { id: string; row: NotificationRow }[];
  onOpen: (row: NotificationRow) => void;
  onDismiss: (id: string) => void;
}) {
  const theme = useTheme();
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'fixed',
        zIndex: theme.zIndex.snackbar,
        display: 'flex',
        gap: 1,
        pointerEvents: 'none',
        // Phone: under the status bar, full width inside the 16px gutter,
        // newest on top.
        top: { xs: 'calc(8px + env(safe-area-inset-top, 0px))', md: 'auto' },
        left: { xs: 16, md: 24 },
        right: { xs: 16, md: 'auto' },
        bottom: { xs: 'auto', md: 24 },
        flexDirection: { xs: 'column-reverse', md: 'column' },
        width: { xs: 'auto', md: 360 },
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} row={t.row} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </Box>
  );
}

function ToastItem({
  row,
  onOpen,
  onDismiss,
}: {
  row: NotificationRow;
  onOpen: (row: NotificationRow) => void;
  onDismiss: (id: string) => void;
}) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const { t, i18n } = useTranslation('common');
  const [paused, setPaused] = useState(false);
  const remaining = useRef(LIFETIME_MS);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(row.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(1_000, remaining.current - (Date.now() - started));
    };
  }, [paused, onDismiss, row.id]);

  const { title, body, detail } = notificationText(row, t, i18n);
  const accent = tone('brand', mode);

  return (
    <Grow in appear>
      <Box
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
        }}
        sx={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0.5,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderLeft: `3px solid ${accent.dot}`,
          borderRadius: `${radii.card}px`,
          boxShadow: lift.cardStrong,
          overflow: 'hidden',
        }}
      >
        <ButtonBase
          onClick={() => onOpen(row)}
          sx={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            gap: 1.25,
            px: 1.5,
            py: 1.25,
          }}
        >
          <Box
            sx={{
              width: 30,
              height: 30,
              flexShrink: 0,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: accent.bg,
              color: accent.fg,
            }}
          >
            <Icon name="notifications" size={18} />
          </Box>
          <Stack sx={{ minWidth: 0 }} spacing={0.25}>
            <Typography sx={{ fontSize: '0.84375rem', fontWeight: 700, lineHeight: 1.35 }}>
              {title}
            </Typography>
            {body && (
              <Typography sx={{ fontSize: '0.78125rem', color: 'text.secondary', lineHeight: 1.4 }}>
                {body}
              </Typography>
            )}
            {detail && <NotificationDetail text={detail} />}
          </Stack>
        </ButtonBase>
        <IconButton
          size="small"
          aria-label={t('actions.close')}
          onClick={() => onDismiss(row.id)}
          sx={{ mt: 0.75, mr: 0.5, color: 'text.secondary' }}
        >
          <Icon name="close" size={18} />
        </IconButton>
      </Box>
    </Grow>
  );
}

/** "This order was updated. Reload to see the changes" with its button. */
export function LiveUpdateBanner({ onReload }: { onReload: () => void }) {
  const { t } = useTranslation('common');
  return (
    <Box role="status" aria-live="polite">
      <Callout
        tone="warning"
        icon="sync"
        title={t('notifications.banner.updated')}
        action={
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            onClick={onReload}
            sx={{ flexShrink: 0 }}
          >
            {t('notifications.banner.reload')}
          </Button>
        }
        sx={{ mb: 2 }}
      />
    </Box>
  );
}

/**
 * A third line under a notification's body: raw text from the row's params
 * (the lab's explanation of a price), muted and clamped to one line. The bell
 * uses it too.
 */
export function NotificationDetail({ text }: { text: string }) {
  const mode = useTheme().palette.mode;
  return (
    <Typography
      sx={{
        fontSize: '0.75rem',
        color: surfaces[mode].textMuted,
        lineHeight: 1.4,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
      }}
    >
      {text}
    </Typography>
  );
}
