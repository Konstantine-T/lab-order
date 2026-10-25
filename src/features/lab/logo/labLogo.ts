import { supabase } from '@/lib/supabase';

export const LAB_LOGO_BUCKET = 'lab-logos';

/** The bucket's own limit (0047). Checked here too so an oversized file fails
 *  instantly instead of after a slow upload. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Raster only: an SVG can carry script (0047 refuses it at the bucket too).
 *  The extension comes from the type, not the file name, so the stored name is
 *  always `<uuid>.<png|jpg|webp>` — the shape 0047's trigger accepts. */
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export const ACCEPTED_LOGO_TYPES = Object.keys(EXT_BY_TYPE);

export type LabLogoErrorKind = 'too-large' | 'wrong-type' | 'failed';

export class LabLogoError extends Error {
  constructor(readonly kind: LabLogoErrorKind, cause?: unknown) {
    super(kind);
    this.name = 'LabLogoError';
    this.cause = cause;
  }
}

/**
 * Upload a logo and return its public URL.
 *
 * The path is `<lab_id>/<uuid>.<ext>`: 0047's storage policies read the first
 * segment as the owning lab, and its `labs.logo_url` trigger accepts only a
 * URL into that folder — the shape is what authorizes the write. A fresh name
 * per upload means no cache ever serves the previous logo under the new URL.
 */
export async function uploadLabLogo(labId: string, file: File): Promise<string> {
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) throw new LabLogoError('wrong-type');
  if (file.size > MAX_LOGO_BYTES) throw new LabLogoError('too-large');

  const path = `${labId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(LAB_LOGO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new LabLogoError('failed', error);

  return supabase.storage.from(LAB_LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Delete a previously uploaded logo.
 *
 * Best-effort: a file that is no longer referenced is not worth failing the
 * change over. Only URLs inside our own bucket are touched — a logo pasted as
 * a link before 0047 lives on someone else's server and is left alone.
 */
export async function removeLabLogo(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const marker = `/${LAB_LOGO_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return;
  const path = url.slice(at + marker.length).split(/[?#]/)[0];
  if (!path) return;
  try {
    await supabase.storage.from(LAB_LOGO_BUCKET).remove([decodeURIComponent(path)]);
  } catch {
    // Best-effort, see above.
  }
}
