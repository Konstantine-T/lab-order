import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useRealtimeConnected } from './realtimeStatus';
import type { NotificationRow } from '@/types/database';

/**
 * The bell's data: the last 30 days, newest first, 30 rows a page, plus the
 * unread count as a `head` count (no rows on the wire).
 *
 * RLS (0043) limits both to the signed-in user's own rows; the user id in the
 * key only keeps one account's cache from serving the next one in this tab.
 * A live INSERT is added to the cache by `addLiveNotification` instead of a
 * refetch; a reconnect refetches both. The count also polls (every minute
 * while the socket is down, every five while it is up) and refetches on
 * focus, the way the sidebar badges do, so the bell is right without Realtime.
 */
export const PAGE_SIZE = 30;
const RETENTION_DAYS = 30;

export const notificationsKey = (userId: string | undefined) => ['notifications', userId] as const;
export const unreadKey = (userId: string | undefined) => ['notifications-unread', userId] as const;

const since = () => new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

/**
 * The loaded rows plus whether the server has more. A plain query with a
 * hand-rolled "load more" rather than `useInfiniteQuery`: the infinite
 * observer pulls helpers out of the query core that lives in the entry
 * chunk, and nothing else in the app pages that way.
 */
type ListData = { rows: NotificationRow[]; hasMore: boolean };

async function fetchRange(from: number, count: number): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, kind, order_id, params, created_at, read_at')
    .gte('created_at', since())
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + count - 1);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export function useNotificationList(userId: string | undefined, enabled: boolean) {
  const qc = useQueryClient();
  const key = notificationsKey(userId);
  // Opening the bell refetches the count too, so the badge and the list it
  // opens cannot disagree.
  useEffect(() => {
    if (enabled && userId) void qc.invalidateQueries({ queryKey: unreadKey(userId) });
  }, [qc, userId, enabled]);
  const query = useQuery({
    queryKey: key,
    enabled: !!userId && enabled,
    queryFn: async (): Promise<ListData> => {
      // A refetch (a reconnect) keeps as many rows as were already loaded.
      const loaded = qc.getQueryData<ListData>(key)?.rows.length ?? 0;
      const want = Math.max(PAGE_SIZE, Math.ceil(loaded / PAGE_SIZE) * PAGE_SIZE);
      const rows = await fetchRange(0, want);
      return { rows, hasMore: rows.length === want };
    },
  });

  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = useCallback(async () => {
    const listKey = notificationsKey(userId);
    const current = qc.getQueryData<ListData>(listKey);
    if (!current || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchRange(current.rows.length, PAGE_SIZE);
      qc.setQueryData<ListData>(listKey, (old) => {
        if (!old) return old;
        // A live row prepended meanwhile shifts the offsets by one.
        const have = new Set(old.rows.map((r) => r.id));
        return {
          rows: [...old.rows, ...next.filter((r) => !have.has(r.id))],
          hasMore: next.length === PAGE_SIZE,
        };
      });
    } finally {
      setLoadingMore(false);
    }
  }, [qc, userId, loadingMore]);

  return {
    rows: query.data?.rows ?? [],
    isLoading: query.isLoading,
    hasMore: query.data?.hasMore ?? false,
    loadingMore,
    loadMore,
  };
}

const LIVE_REFRESH_MS = 300_000;
const POLL_REFRESH_MS = 60_000;

export function useUnreadCount(userId: string | undefined) {
  const connected = useRealtimeConnected();
  const { data } = useQuery({
    queryKey: unreadKey(userId),
    enabled: !!userId,
    refetchInterval: connected ? LIVE_REFRESH_MS : POLL_REFRESH_MS,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .gte('created_at', since());
      if (error) throw error;
      return count ?? 0;
    },
  });
  return data ?? 0;
}

/** A row that just arrived over the socket: on top of the list, +1 unread. */
export function addLiveNotification(qc: QueryClient, userId: string, row: NotificationRow) {
  let added = false;
  qc.setQueryData<ListData>(notificationsKey(userId), (old) => {
    if (!old || old.rows.some((r) => r.id === row.id)) return old;
    added = true;
    return { ...old, rows: [row, ...old.rows] };
  });
  // The list may not be loaded yet (the bell was never opened): the count
  // still moves, and the list fetches the row itself when it opens.
  const inList = qc.getQueryData<ListData>(notificationsKey(userId));
  if (added || !inList) {
    if (!row.read_at) qc.setQueryData<number>(unreadKey(userId), (n) => (n ?? 0) + 1);
  }
}

function markInCache(qc: QueryClient, userId: string, ids: string[] | null) {
  const now = new Date().toISOString();
  qc.setQueryData<ListData>(notificationsKey(userId), (old) =>
    old
      ? {
          ...old,
          rows: old.rows.map((r) =>
            r.read_at || (ids && !ids.includes(r.id)) ? r : { ...r, read_at: now },
          ),
        }
      : old,
  );
  // "All" is exact at once; otherwise the RPC says how many it changed.
  if (!ids) qc.setQueryData<number>(unreadKey(userId), 0);
}

/**
 * Marks rows read through the RPC (the table has no client UPDATE grant).
 * The dot goes at once; the count moves by what the RPC actually changed,
 * and a failure refetches the truth.
 */
export function useMarkRead(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[] | null) => {
      const { data, error } = await supabase.rpc('mark_notifications_read', { p_ids: ids });
      if (error) throw error;
      return typeof data === 'number' ? data : 0;
    },
    onMutate: async (ids) => {
      // A count fetched before the RPC lands would undo the optimistic change.
      await qc.cancelQueries({ queryKey: unreadKey(userId) });
      if (userId) markInCache(qc, userId, ids);
    },
    onSuccess: (changed, ids) => {
      if (ids && changed > 0) {
        qc.setQueryData<number>(unreadKey(userId), (n) => Math.max(0, (n ?? 0) - changed));
      }
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: notificationsKey(userId) });
      void qc.invalidateQueries({ queryKey: unreadKey(userId) });
    },
  });
}
