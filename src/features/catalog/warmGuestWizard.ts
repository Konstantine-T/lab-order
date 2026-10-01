let warmed = false;

/**
 * Starts downloading the guest order wizard's chunk when a guest shows intent
 * to order from a catalogue card (hover, focus, touch) — the lab profile
 * preloads it while idle (`routes.tsx`), but the card's order button skips
 * that page. Same module as the route's own loader, so the browser fetches it
 * once and the route then resolves it from cache. A failure is ignored: the
 * route retries, and handles a stale chunk, when it actually mounts.
 */
export function warmGuestWizard(): void {
  if (warmed) return;
  warmed = true;
  import('@/routes/guestOrderRoute').catch(() => {
    warmed = false;
  });
}
