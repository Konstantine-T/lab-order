import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { keysForTrashChange } from '@/features/notifications/liveQueries';
import type { OrderTrashSide } from '@/types/database';
import type { OrderTrashStateEmbed } from './trashFilter';

/**
 * The 14-day trash of finished orders (0054, Trello SLXFiKPX).
 *
 * Each side deletes only from its own desk: the lab its incoming orders
 * (side 'LAB'), the doctor its own orders and a buying lab its purchases
 * (side 'DOCTOR', the buying profile being the order's doctor). Nothing is
 * erased: an `order_trash` row hides the order from that side, for 14 days
 * restorably, then for good. The other side, finances, files and the clinic
 * never notice.
 *
 * EVERY ORDER LIST OF A SIDE excludes that side's rows, in the trash or gone,
 * server-side: see trashFilter.ts.
 */

/** Days an order stays restorable (purge_after = deleted_at + 14 days). */
export const TRASH_DAYS = 14;

/** The RPCs take at most this many ids per call (`too_many`). */
export const TRASH_BATCH = 200;

export { ORDER_TRASH_EMBED, ORDER_TRASH_STATE_EMBED } from './trashFilter';

/** Whose trash a screen shows, and the id its queries filter on. */
export type TrashScope = { side: 'LAB'; labId: string } | { side: 'DOCTOR'; doctorId: string };

export const scopeIdOf = (scope: TrashScope) =>
  scope.side === 'LAB' ? scope.labId : scope.doctorId;

export const trashListKey = (scope: TrashScope) => ['order-trash', scope.side, scopeIdOf(scope)];
export const trashCountKey = (scope: TrashScope) => [
  'order-trash-count',
  scope.side,
  scopeIdOf(scope),
];

// ===== The state of one order ================================================

export type TrashState =
  | { kind: 'none' }
  | { kind: 'inTrash'; purgeAfter: string }
  | { kind: 'gone' };

/**
 * From the order page's `order_trash(purge_after, purged_at)` embed. RLS
 * returns this side's row only, so at most one, and never a cleared one (a
 * restored or reopened order); a missing embed (an older cache entry) reads
 * as not trashed.
 *
 * `purged_at` ("Delete now" / "Empty trash") is gone whatever this clock
 * says: purge_after is then the server's now(), which a browser clock running
 * behind has not reached yet. Only the 14 days running out are judged by the
 * browser's clock.
 */
export function trashStateOf(
  rows: OrderTrashStateEmbed | null | undefined,
  now: number = Date.now(),
): TrashState {
  const row = rows?.[0];
  if (!row) return { kind: 'none' };
  if (row.purged_at) return { kind: 'gone' };
  return new Date(row.purge_after).getTime() > now
    ? { kind: 'inTrash', purgeAfter: row.purge_after }
    : { kind: 'gone' };
}

/** "Deleted in N days": whole days left, at least 1 while it is still here. */
export function daysLeft(purgeAfter: string, now: number = Date.now()): number {
  const ms = new Date(purgeAfter).getTime() - now;
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

// ===== RPCs ==================================================================

function chunks<T>(items: T[], size = TRASH_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Batched by 200, in order. A selection larger than one call is not atomic:
 * a refusal stops at the batch it happened in, and the lists refetch either
 * way, so what shows is what the database holds.
 */
async function callBatched(
  fn: 'restore_orders' | 'purge_trashed_orders',
  ids: string[],
  side?: OrderTrashSide,
): Promise<number> {
  let total = 0;
  for (const batch of chunks([...new Set(ids)])) {
    const { data, error } = await supabase.rpc(fn, {
      p_order_ids: batch,
      ...(side ? { p_side: side } : {}),
    });
    if (error) throw error;
    total += typeof data === 'number' ? data : 0;
  }
  return total;
}

/** Which of `batch` are in this side's trash now (RLS shows no other side's
 *  row, and no cleared one). */
async function inTrashNow(batch: string[]): Promise<string[]> {
  // A row trashed now has purge_after = server now + 14 days; a gone one,
  // at most server now. A day ahead of this clock tells them apart however
  // far the browser's clock is off (within a day).
  const cutoff = new Date(Date.now() + 86_400_000).toISOString();
  const kept = new Set<string>();
  for (const part of chunks(batch, 100)) {
    const { data, error } = await supabase
      .from('order_trash')
      .select('order_id')
      .in('order_id', part)
      .gt('purge_after', cutoff);
    if (error) throw error;
    for (const row of (data ?? []) as { order_id: string }[]) kept.add(row.order_id);
  }
  return batch.filter((id) => kept.has(id));
}

/** What a trash of several orders did: the ids it moved, and the refusal (or
 *  failure) that stopped it part way, if one did. */
export type TrashOutcome = { trashedIds: string[]; error: unknown };

/**
 * `trash_orders`, returning the ids this call actually put (or kept) in the
 * caller's trash: what the toast counts and what its Undo restores.
 *
 * An id already gone on this side stays gone and is not counted (A3);
 * restoring it would raise `trash_expired` for the whole Undo, so it must not
 * be handed on. Each id the RPC touched counts once, so only a batch with a
 * short count needs the extra read of this side's rows.
 *
 * Over 200 ids is several calls, each its own transaction. When a later one
 * is refused (an order reopened meanwhile, `order_not_finished`) or fails,
 * the earlier ones have already moved their orders: they come back as
 * `trashedIds` beside the `error`, so the list can still toast them with
 * Undo and say that the rest did not move. When nothing moved, it throws,
 * as one call does.
 */
export async function trashOrdersTracked(ids: string[]): Promise<TrashOutcome> {
  const trashedIds: string[] = [];
  for (const batch of chunks([...new Set(ids)])) {
    try {
      const { data, error } = await supabase.rpc('trash_orders', { p_order_ids: batch });
      if (error) throw error;
      const count = typeof data === 'number' ? data : 0;
      if (count >= batch.length) trashedIds.push(...batch);
      else if (count > 0) trashedIds.push(...(await inTrashNow(batch)));
    } catch (error) {
      if (trashedIds.length === 0) throw error;
      return { trashedIds, error };
    }
  }
  return { trashedIds, error: null };
}

export const restoreOrders = (ids: string[]) => callBatched('restore_orders', ids);

/** "Delete now": with this trash's side, so an id from the other trash of a
 *  lab that also buys is refused (`not_your_order`), never purged. */
export const purgeTrashedOrders = (ids: string[], side: OrderTrashSide) =>
  callBatched('purge_trashed_orders', ids, side);

/**
 * "Empty trash": every row of this side's trash in one call, however many
 * and whether the page loaded them or not (the list is paged), and never the
 * caller's other trash (a lab owner who also buys has two).
 */
export async function emptyTrash(side: OrderTrashSide): Promise<number> {
  const { data, error } = await supabase.rpc('purge_trashed_orders', {
    p_order_ids: null,
    p_side: side,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

// ===== Errors ================================================================

export type TrashErrorKind =
  | 'order_not_finished'
  | 'not_your_order'
  | 'trash_expired'
  | 'too_many'
  | 'generic';

/** The RPCs raise bare codes in `message`; never show the raw text. */
export function trashErrorKind(err: unknown): TrashErrorKind {
  const msg = String((err as { message?: string } | null)?.message ?? '');
  for (const kind of [
    'order_not_finished',
    'not_your_order',
    'trash_expired',
    'too_many',
  ] as const) {
    if (msg.includes(kind)) return kind;
  }
  return 'generic';
}

/** Not `too_many`: a key ending in `_many` reads as a Russian plural form. */
const ERROR_KEY: Record<TrashErrorKind, string> = {
  order_not_finished: 'order_not_finished',
  not_your_order: 'not_your_order',
  trash_expired: 'trash_expired',
  too_many: 'tooMany',
  generic: 'generic',
};

/** The `common` key of the message for a failed trash call. */
export const trashErrorKey = (err: unknown) => `trash.errors.${ERROR_KEY[trashErrorKind(err)]}`;

// ===== Cache =================================================================

/**
 * After this tab trashed, restored or purged: the same keys a realtime
 * `order_trash` event refreshes in another tab (liveQueries.ts), so the two
 * cannot drift.
 */
export function invalidateAfterTrashChange(
  qc: QueryClient,
  side: OrderTrashSide,
  orderIds: string[],
) {
  const seen = new Set<string>();
  const keys = orderIds.length
    ? orderIds.flatMap((id) => keysForTrashChange(side, id))
    : keysForTrashChange(side, null);
  for (const key of keys) {
    const id = JSON.stringify(key);
    if (seen.has(id)) continue;
    seen.add(id);
    void qc.invalidateQueries({ queryKey: key });
  }
}
