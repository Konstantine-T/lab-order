import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import type { NotificationRow, UserRole } from '@/types/database';
import {
  ALL_LIVE_KEYS,
  createDebouncedInvalidator,
  keysForNotification,
  keysForRow,
  type LiveTable,
} from './liveQueries';
import { setRealtimeConnected } from './realtimeStatus';
import { isDoctorSideKind, isKnownKind, notificationTarget } from './notificationText';
import {
  addLiveNotification,
  notificationsKey,
  unreadKey,
  useMarkRead,
  useUnreadCount,
} from './useNotifications';
import { listenForFirstGesture, playChime, readMuted, writeMuted } from './sound';
import { NotificationToasts } from './LiveSurfaces';
import { CenterContext, type CenterValue } from './liveContext';

/**
 * LIVE UPDATES AND NOTIFICATIONS for one signed-in area.
 *
 * Mounted by the two signed-in shells (AppShell for lab and admin,
 * TopNavShell for doctor and clinic), which only the lazy area chunks import:
 * guests and the landing page never open a socket (J4), and none of this is in
 * the entry chunk.
 *
 * One channel per role. Row events on the tables the pages read only
 * invalidate React Query keys (liveQueries.ts); the notifications INSERT feeds
 * the bell, a toast, the tab title and the chime. INSERT and UPDATE only:
 * realtime does not RLS-filter DELETE, so deletes surface on the next refetch
 * (J3).
 *
 * After every reconnect everything in the map is invalidated and the bell is
 * refetched, without toasts: events missed while the laptop slept are
 * otherwise lost for good.
 */
type Toast = { id: string; row: NotificationRow };

const MAX_VISIBLE_TOASTS = 3;

type Listener = {
  table: LiveTable | 'notifications';
  filter?: string;
  events: ('INSERT' | 'UPDATE')[];
};

function listenersFor(
  role: UserRole,
  ids: { userId: string; doctorId?: string; labId?: string; buyerProfileId?: string },
): Listener[] {
  const both: ('INSERT' | 'UPDATE')[] = ['INSERT', 'UPDATE'];
  const notifications: Listener = {
    table: 'notifications',
    filter: `user_id=eq.${ids.userId}`,
    events: ['INSERT'],
  };
  const marketplace: Listener[] = [
    { table: 'lab_services', events: both },
    { table: 'lab_forms', events: both },
    { table: 'labs', events: both },
  ];
  switch (role) {
    case 'DOCTOR':
      return [
        notifications,
        ...(ids.doctorId
          ? [{ table: 'orders', filter: `doctor_id=eq.${ids.doctorId}`, events: both } as Listener]
          : []),
        { table: 'order_clarifications', events: both },
        { table: 'order_files', events: both },
        { table: 'clinic_doctor_invites', events: both },
        ...(ids.doctorId
          ? [
              { table: 'lab_reviews', filter: `doctor_id=eq.${ids.doctorId}`, events: both } as Listener,
              // The clinics they belong to (0050).
              { table: 'clinic_memberships', filter: `doctor_id=eq.${ids.doctorId}`, events: both } as Listener,
            ]
          : []),
        ...marketplace,
      ];
    case 'LAB_MAIN_ADMIN':
      return [
        notifications,
        ...(ids.labId
          ? [
              { table: 'orders', filter: `lab_id=eq.${ids.labId}`, events: both } as Listener,
              { table: 'labs', filter: `id=eq.${ids.labId}`, events: both } as Listener,
              { table: 'lab_reviews', filter: `lab_id=eq.${ids.labId}`, events: both } as Listener,
            ]
          : []),
        // Its orders to other labs (0048), through its buying profile, and its
        // reviews of those labs: the doctor's two filtered listeners. And the
        // catalogue its marketplace shows, as for a doctor, so another lab's
        // renamed or withdrawn service updates there too (the profile exists
        // by the time the marketplace renders: BuyerProfileGate waits for it).
        // The unfiltered `labs` listener overlaps the own-lab one above; the
        // debounced invalidator folds the two.
        ...(ids.buyerProfileId
          ? [
              {
                table: 'orders',
                filter: `doctor_id=eq.${ids.buyerProfileId}`,
                events: both,
              } as Listener,
              {
                table: 'lab_reviews',
                filter: `doctor_id=eq.${ids.buyerProfileId}`,
                events: both,
              } as Listener,
              ...marketplace,
            ]
          : []),
        // RLS limits it to reports on the lab's own reviews.
        { table: 'lab_review_reports', events: both },
        { table: 'order_clarifications', events: both },
        { table: 'order_files', events: both },
      ];
    case 'CLINIC_ADMIN':
      return [
        notifications,
        // RLS limits the clinic to the orders placed for it (0050).
        { table: 'orders', events: both },
        { table: 'order_clarifications', events: both },
        { table: 'order_files', events: both },
        { table: 'clinic_doctor_invites', events: both },
        // Its roster (0050); RLS limits it to the clinic's own rows.
        { table: 'clinic_memberships', events: both },
        ...marketplace,
      ];
    case 'PLATFORM_ADMIN':
      return [
        notifications,
        { table: 'labs', events: both },
        { table: 'feedback', events: both },
        { table: 'lab_reviews', events: both },
        { table: 'lab_review_reports', events: both },
      ];
  }
}

const LAB_STATUS_KINDS = new Set([
  'lab_approved',
  'lab_suspended',
  'lab_changes_requested',
  'lab_rejected',
]);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { i18n } = useTranslation('common');
  const userId = user?.id;
  const role = user?.role;
  const doctorId = user?.doctor_profile?.id;
  const labId = user?.lab?.id;
  const buyerProfileId = user?.buyer_profile?.id;

  const [connected, setConnected] = useState(false);
  const [muted, setMutedState] = useState(readMuted);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const unread = useUnreadCount(userId);
  const markRead = useMarkRead(userId);

  // Read inside the socket callbacks, which are bound once per channel.
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;
  const refreshUserRef = useRef(refreshUser);
  refreshUserRef.current = refreshUser;
  // How many surfaces hold toasts back (the phone bell sheet; a count, since
  // a shell can mount more than one bell).
  const toastHoldsRef = useRef(0);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    writeMuted(next);
  }, []);

  useEffect(() => listenForFirstGesture(), []);

  useEffect(() => {
    if (!userId || !role) return;
    const invalidator = createDebouncedInvalidator(qc);
    let everSubscribed = false;
    let dropped = false;
    // removeChannel reports CLOSED asynchronously; by then the next mount's
    // channel may be up, and this one must not mark the socket as down.
    let disposed = false;

    const onRow =
      (table: LiveTable) => (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as
          | Record<string, unknown>
          | undefined;
        if (row) invalidator.invalidate(keysForRow(table, row));
      };

    const onNotification = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const row = payload.new as unknown as NotificationRow | undefined;
      if (!row?.id || row.user_id !== userId) return;
      addLiveNotification(qc, userId, row);
      invalidator.invalidate(keysForNotification(row.kind));
      // The lab's status lives on the AppUser (sidebar card, profile page).
      // Silent: the profile page re-seeds only when the stored values change.
      if (LAB_STATUS_KINDS.has(row.kind)) void refreshUserRef.current({ silent: true });
      // A purchase notification while this session predates the lab's buying
      // profile (it was created on another device): reload the AppUser so the
      // purchase badge, the doctor_id listener and the purchase pages see it.
      else if (role === 'LAB_MAIN_ADMIN' && !buyerProfileId && isDoctorSideKind(row.kind)) {
        void refreshUserRef.current({ silent: true });
      }
      // A kind this build cannot word stays in the bell as "New notification"
      // and does not interrupt anyone.
      if (!isKnownKind(row.kind, i18nRef.current)) return;
      // The phone sheet is open and already shows this row at the top: no
      // toast now, and none queued for when it closes.
      if (toastHoldsRef.current === 0) {
        setToasts((list) =>
          list.some((t) => t.id === row.id) ? list : [...list, { id: row.id, row }],
        );
      }
      playChime(mutedRef.current);
    };

    // Unique per mount: StrictMode mounts twice in development, and a second
    // channel with the same topic would share the first one's bindings.
    const name = `live:${role}:${userId}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(name);
    for (const l of listenersFor(role, { userId, doctorId, labId, buyerProfileId })) {
      for (const event of l.events) {
        channel.on(
          'postgres_changes',
          { event, schema: 'public', table: l.table, ...(l.filter ? { filter: l.filter } : {}) },
          l.table === 'notifications' ? onNotification : onRow(l.table),
        );
      }
    }

    channel.subscribe((status) => {
      if (disposed) return;
      if (status === 'SUBSCRIBED') {
        setConnected(true);
        setRealtimeConnected(true);
        if (dropped) {
          // Catch up on whatever happened while the socket was down, including
          // a first join that failed before it succeeded. The bell simply
          // shows the missed rows with the right count; no toasts.
          invalidator.invalidate(ALL_LIVE_KEYS);
          void qc.invalidateQueries({ queryKey: notificationsKey(userId) });
          void qc.invalidateQueries({ queryKey: unreadKey(userId) });
        } else if (!everSubscribed) {
          // A clean first join: the pages fetched just before it, but a row
          // inserted between that fetch and the join reached nobody. The bell
          // has no other way to hear of it, so it alone re-reads.
          void qc.invalidateQueries({ queryKey: notificationsKey(userId) });
          void qc.invalidateQueries({ queryKey: unreadKey(userId) });
        }
        everSubscribed = true;
        dropped = false;
        return;
      }
      // CHANNEL_ERROR, TIMED_OUT, CLOSED: supabase-js rejoins by itself; the
      // badges fall back to their 60-second poll meanwhile.
      dropped = true;
      setConnected(false);
      setRealtimeConnected(false);
    });

    return () => {
      disposed = true;
      invalidator.cancel();
      setConnected(false);
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [userId, role, doctorId, labId, buyerProfileId, qc]);

  // ── Tab title: "(3) Dentallabs.ge" while anything is unread ─────────────
  const baseTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (baseTitleRef.current === null) baseTitleRef.current = document.title;
    const prefix = /^\(\d+\+?\) /;
    const apply = () => {
      const base = baseTitleRef.current ?? '';
      const next = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // A page that sets its own title replaces ours: adopt it as the new base
    // and put the count back in front.
    const titleEl = document.querySelector('title');
    const observer =
      titleEl && typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            const current = document.title;
            const stripped = current.replace(prefix, '');
            if (stripped !== baseTitleRef.current) {
              baseTitleRef.current = stripped;
              apply();
            } else if (unread > 0 && !prefix.test(current)) {
              apply();
            }
          })
        : null;
    observer?.observe(titleEl!, { childList: true, characterData: true, subtree: true });
    return () => observer?.disconnect();
  }, [unread]);
  useEffect(
    () => () => {
      if (baseTitleRef.current !== null) document.title = baseTitleRef.current;
    },
    [],
  );

  const openNotification = useCallback(
    (row: NotificationRow) => {
      if (!row.read_at) markRead.mutate([row.id]);
      setToasts((list) => list.filter((t) => t.id !== row.id));
      const to = notificationTarget(row, role);
      if (to) navigate(to);
    },
    [markRead, navigate, role],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  /*
   * Phone bell sheet open → no toasts (owner decision). Dropped rather than
   * held: every row a toast would carry is already in the open sheet's list,
   * where the person is looking, and replaying them on close would dump a
   * burst of toasts for things they have just seen. The toasts showing when
   * the sheet opens go too: they are the newest rows in it.
   */
  const holdToasts = useCallback(() => {
    toastHoldsRef.current += 1;
    setToasts([]);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      toastHoldsRef.current -= 1;
    };
  }, []);

  const value = useMemo<CenterValue>(
    () => ({ userId, role, connected, unread, muted, setMuted, openNotification, holdToasts }),
    [userId, role, connected, unread, muted, setMuted, openNotification, holdToasts],
  );

  return (
    <CenterContext.Provider value={value}>
      {children}
      <NotificationToasts
        toasts={toasts.slice(0, MAX_VISIBLE_TOASTS)}
        onOpen={openNotification}
        onDismiss={dismissToast}
      />
    </CenterContext.Provider>
  );
}
