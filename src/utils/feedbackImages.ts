/** Shared contract for feedback screenshots — the sender's dialog and the
 *  admin inbox have to agree on the bucket, and the limits here mirror the
 *  ones the bucket itself enforces (migration 0019). */

export const FEEDBACK_BUCKET = 'feedback-images';

export const MAX_FEEDBACK_IMAGES = 3;
export const MAX_FEEDBACK_IMAGE_BYTES = 5 * 1024 * 1024;

export const FEEDBACK_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

/** `image/png` → `png`. Falls back to `png` for anything unmapped, which the
 *  type check upstream already ruled out. */
export function feedbackImageExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  const sub = mimeType.split('/')[1];
  return sub && /^[a-z0-9]+$/.test(sub) ? sub : 'png';
}

/** Storage key for a new attachment. The first segment must be the sender's
 *  own user id — both storage RLS and the feedback insert policy check it. */
export function feedbackImagePath(userId: string, mimeType: string): string {
  const uuid =
    typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${userId}/${uuid}.${feedbackImageExtension(mimeType)}`;
}

export function isAllowedFeedbackImage(file: { type: string }): boolean {
  return (FEEDBACK_IMAGE_TYPES as readonly string[]).includes(file.type);
}

/** 1572864 → "1.5 MB", 5242880 → "5 MB". Used in the size hints and limits. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}
