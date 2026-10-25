import { useEffect, useSyncExternalStore } from 'react';

/*
 * Who has the completion dialog open, outside any one order card.
 *
 * For a doctor the dialog does not close when `complete_order` succeeds: it
 * turns into the review step (0044, B2). But completing re-renders the screen
 * it was opened from — on the orders list the card moves to another group and
 * remounts, and its button becomes "Continue project" — so a dialog owned by
 * the button would vanish halfway through. The doctor's layout mounts one
 * `CompletionDialogHost` instead, and the buttons only ask it to open.
 *
 * Without a host on the page (any area that has not mounted one) `open`
 * returns false and the button falls back to its own plain dialog.
 */

export type CompletionRequest = { orderId: string; nonce: number };

let current: CompletionRequest | null = null;
let hosts = 0;
let nonce = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Opens the host's dialog for `orderId`; false when no host is mounted. */
export function openCompletionDialog(orderId: string): boolean {
  if (hosts === 0) return false;
  nonce += 1;
  current = { orderId, nonce };
  emit();
  return true;
}

export function closeCompletionDialog() {
  if (!current) return;
  current = null;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useCompletionRequest(): CompletionRequest | null {
  return useSyncExternalStore(subscribe, () => current);
}

/** Called by the host: while it is mounted, buttons route through it. */
export function useRegisterCompletionHost() {
  useEffect(() => {
    hosts += 1;
    return () => {
      hosts -= 1;
      if (hosts === 0) closeCompletionDialog();
    };
  }, []);
}
