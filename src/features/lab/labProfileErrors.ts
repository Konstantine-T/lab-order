/**
 * Why a write to the lab's own profile failed, in terms LabProfilePage can
 * translate (`profile.errors.<kind>` in the `lab` namespace). Never show the
 * raw Postgres message: it is English-only and names triggers and SQL at the
 * user.
 *
 *   locked      — `lab_identity_locked` (0040): the name, legal, contact or
 *                 bank details of a lab that is no longer in review. Reached
 *                 from a page opened before an admin approved (or rejected,
 *                 or suspended) the lab. Also 0003's refusal of an approval
 *                 status change, which a resubmit from such a page meets.
 *   reload      — `public_translations_rpc_only` / `price_lists_rpc_only`
 *                 (0037 / 0038): a direct write to a column that only its RPC
 *                 may set. Only an outdated client sends one.
 *   permission  — `not_your_lab`, or any other refusal (42501 / RLS).
 *   invalid     — the RPC's or a CHECK constraint's shape rules
 *                 (`invalid_translations`, 22023 / 23514).
 *   network     — the request never got an answer.
 *   generic     — anything else.
 */
export type LabProfileErrorKind =
  | 'locked'
  | 'reload'
  | 'permission'
  | 'invalid'
  | 'network'
  | 'generic';

export function classifyLabProfileError(err: unknown): LabProfileErrorKind {
  const e = (err ?? {}) as { message?: unknown; code?: unknown };
  const msg = String(e.message ?? '').toLowerCase();
  const code = String(e.code ?? '');

  // By message first: 0040 raises with 42501, the same code as a refusal.
  if (msg.includes('lab_identity_locked')) return 'locked';
  if (msg.includes('only platform admins can change approval_status')) return 'locked';
  if (msg.includes('public_translations_rpc_only') || msg.includes('price_lists_rpc_only')) {
    return 'reload';
  }
  if (
    msg.includes('not_your_lab') ||
    msg.includes('not_authenticated') ||
    msg.includes('row-level security') ||
    msg.includes('permission denied') ||
    code === '42501'
  ) {
    return 'permission';
  }
  if (msg.includes('invalid_translations') || code === '22023' || code === '23514') {
    return 'invalid';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) {
    return 'network';
  }
  return 'generic';
}
