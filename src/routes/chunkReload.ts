/**
 * One automatic reload when a lazily loaded chunk does not arrive.
 *
 * The usual cause is a deploy. Chunk names carry a content hash, and a tab
 * opened before the deploy still asks for the old ones — which are gone.
 * `vercel.json` rewrites every unknown path to `/index.html`, so the request
 * comes back as HTML rather than a 404, and the import fails with "Failed to
 * fetch dynamically imported module". Reloading fetches the new `index.html`
 * and with it the new chunk names.
 *
 * Returns true when a reload has started (the caller should keep its spinner
 * up until the page goes away) and false when it did not, so the caller shows
 * its error instead:
 *   - offline — a reload would swap our message for the browser's error page;
 *   - a reload already happened in this tab within the last minute — the chunk
 *     is really missing, and reloading again would loop;
 *   - sessionStorage is unavailable — without it there is no loop guard.
 */
const RELOADED_AT_KEY = 'lab-order:chunk-reload-at';
const LOOP_GUARD_MS = 60_000;

let reloading = false;

export function reloadForStaleChunk(beforeReload?: () => void): boolean {
  if (reloading) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
    if (Date.now() - last < LOOP_GUARD_MS) return false;
    sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
  } catch {
    return false;
  }
  reloading = true;
  beforeReload?.();
  window.location.reload();
  return true;
}
