/**
 * A confirmation that survives the page re-mounting after `refreshUser()`.
 *
 * `refreshUser()` re-hydrates the AppUser, and while it does the route guards
 * (`ProtectedRoute`, `RoleGuard`) render a full-page spinner — so the page
 * unmounts and mounts again, and a "saved" message kept in component state
 * vanishes with it. The caller leaves the message here before refreshing; the
 * re-mounted page reads it back.
 *
 * Reading does not consume it (StrictMode runs state initializers twice); it
 * simply expires after a few seconds, which is longer than a refresh takes and
 * shorter than it takes to navigate away and back.
 */
const TTL_MS = 5000;
const notices = new Map<string, { value: string; at: number }>();

export function leaveNotice(key: string, value: string): void {
  notices.set(key, { value, at: Date.now() });
}

export function readNotice(key: string): string | null {
  const n = notices.get(key);
  if (!n) return null;
  if (Date.now() - n.at > TTL_MS) {
    notices.delete(key);
    return null;
  }
  return n.value;
}

export function clearNotice(key: string): void {
  notices.delete(key);
}
