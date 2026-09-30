import { createContext, useContext, useLayoutEffect } from 'react';

export type ShellFocus = {
  /** Where a focused page portals its own header; null until it has mounted. */
  slot: HTMLElement | null;
  setFocused: (on: boolean) => void;
};

/** Provided by `TopNavShell`; its own file so the shell stays fast-refreshable. */
export const ShellFocusContext = createContext<ShellFocus | null>(null);

/**
 * Focus mode: a page that brings its own header asks the shell to step aside.
 *
 * The new-order form is the one user today (the owner's call): the site's top
 * bar and the phone's bottom tabs give way to the form's own header — back,
 * title, the lab it is going to, the draft status — so nothing on screen leads
 * anywhere but through the order. The avatar stays, drawn by the shell at the
 * right of that header, so the account menu is the same menu as everywhere.
 *
 * Returns the element to portal the header into, or null outside this shell
 * (the public shell, which keeps its own bar) and before the slot mounts — the
 * caller renders its header inline then. A layout effect, so the switch lands
 * before the first paint and the site bar never flashes.
 */
export function useFocusedShell(active = true): HTMLElement | null {
  const ctx = useContext(ShellFocusContext);
  const setFocused = ctx?.setFocused;
  useLayoutEffect(() => {
    if (!setFocused || !active) return;
    setFocused(true);
    return () => setFocused(false);
  }, [setFocused, active]);
  return active ? (ctx?.slot ?? null) : null;
}
