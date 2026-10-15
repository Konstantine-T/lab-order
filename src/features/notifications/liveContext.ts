import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { NotificationRow, UserRole } from '@/types/database';

/**
 * The hooks a page uses to consume live updates: the bell's view of
 * `RealtimeProvider`, and `useLiveFormSync` for a form seeded from data that
 * can change under it.
 *
 * One module with the provider's own imports on purpose: every signed-in
 * area loads it with its shell, so it shares the shell's chunk instead of
 * adding a chunk (and a line to the entry's preload map) of its own.
 */

/** What the bell reads from `RealtimeProvider`. */
export type CenterValue = {
  userId: string | undefined;
  role: UserRole | undefined;
  connected: boolean;
  unread: number;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  /** Mark read and go to the row's page. */
  openNotification: (row: NotificationRow) => void;
};

export const CenterContext = createContext<CenterValue | null>(null);

/** The bell's side of the provider. Null outside a signed-in shell. */
export function useNotificationCenter(): CenterValue | null {
  return useContext(CenterContext);
}

type Fields = Record<string, unknown>;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * The rule behind `useLiveFormSync`, per field: `base` is what the form was
 * last seeded with, `next` what the server says now, `current` what is in the
 * form (undefined = follows the server).
 *
 * `patch` holds the untouched fields to update in place; `conflict` is a
 * field changed on both sides; `unsaved` is any field holding input that is
 * neither the old nor the new server value.
 */
export function mergeLiveFields<F extends Fields>(
  base: F,
  next: F,
  current: { [K in keyof F]?: F[K] | undefined },
): { patch: Partial<F>; conflict: boolean; unsaved: boolean } {
  const patch: Partial<F> = {};
  let conflict = false;
  let unsaved = false;
  for (const key of Object.keys(next) as (keyof F)[]) {
    const was = base[key];
    const now = next[key];
    const cur = current[key];
    const clean = cur === undefined || same(cur, was);
    if (!clean && !same(cur, now)) unsaved = true;
    if (same(now, was)) continue;
    if (clean) patch[key] = now;
    else if (!same(cur, now)) conflict = true;
  }
  return { patch, conflict, unsaved };
}

/**
 * Keeps a form that was seeded from fetched data in step with that data,
 * without ever overwriting what the person is typing (ticket jrmd9KL1, D3).
 *
 * With live refetching an order can change under an open form at any moment.
 * Field by field, against what the form was last seeded with:
 *
 *   - untouched field, server value moved   → take the new value, silently
 *   - field the person changed to exactly
 *     the new server value (their own save) → nothing to do
 *   - field the person changed, server moved
 *     to something else                      → keep theirs, raise `stale`
 *
 * `context` is everything else on the record that matters but has no field
 * here (the doctor's edits, for the lab sheet): when it changes while any
 * field holds unsaved input, `stale` is raised too. `reload()` discards the
 * unsaved input and seeds every field from the latest data.
 *
 * A value of `undefined` in `values` means "this field follows the server"
 * and is never treated as unsaved input.
 *
 * `identity` is the record's id: a different record seeds from scratch.
 */
export function useLiveFormSync<F extends Fields>({
  identity,
  incoming,
  values,
  apply,
}: {
  identity: string | undefined;
  /** Null until the data is loaded. */
  incoming: { fields: F; context?: unknown } | null;
  values: { [K in keyof F]: F[K] | undefined };
  /** Writes the given fields into the form state. */
  apply: (fields: Partial<F>) => void;
}): { stale: boolean; reload: () => void } {
  const [stale, setStale] = useState(false);
  const seen = useRef<{ identity: string; fields: F; context: string } | null>(null);
  const latest = useRef(incoming);
  latest.current = incoming;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const signature = incoming ? JSON.stringify([incoming.fields, incoming.context ?? null]) : '';

  useEffect(() => {
    const next = latest.current;
    if (!identity || !next) return;
    const context = JSON.stringify(next.context ?? null);
    const prev = seen.current;
    if (!prev || prev.identity !== identity) {
      seen.current = { identity, fields: next.fields, context };
      setStale(false);
      applyRef.current(next.fields);
      return;
    }

    const { patch, conflict, unsaved } = mergeLiveFields(
      prev.fields,
      next.fields,
      valuesRef.current,
    );
    if (conflict || (unsaved && context !== prev.context)) setStale(true);
    // Nothing in the form differs from the latest data any more (typically
    // the person's own save came back): the warning has nothing left to say.
    else if (!unsaved) setStale(false);
    seen.current = { identity, fields: next.fields, context };
    if (Object.keys(patch).length) applyRef.current(patch);
  }, [identity, signature]);

  const reload = useCallback(() => {
    const next = latest.current;
    if (!identity || !next) return;
    seen.current = { identity, fields: next.fields, context: JSON.stringify(next.context ?? null) };
    applyRef.current(next.fields);
    setStale(false);
  }, [identity]);

  return { stale, reload };
}
