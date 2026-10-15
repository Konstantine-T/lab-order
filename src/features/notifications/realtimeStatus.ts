import { useSyncExternalStore } from 'react';

/**
 * Whether the live socket is up, as a tiny store rather than context.
 *
 * The sidebar badges (`useNavAlerts`) are read by the area layouts, one level
 * above the shells that mount `RealtimeProvider`, so a context would not reach
 * them. Signed-out pages never import this file.
 */
let connected = false;
const listeners = new Set<() => void>();

export function setRealtimeConnected(next: boolean) {
  if (next === connected) return;
  connected = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while the realtime channel is subscribed. */
export function useRealtimeConnected(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => connected,
    () => false,
  );
}
