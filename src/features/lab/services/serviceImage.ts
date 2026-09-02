import { supabase } from '@/lib/supabase';

export const SERVICE_IMAGE_BUCKET = 'service-images';

/** The bucket's own limit (0025). Checked here too so an oversized file fails
 *  instantly instead of after a long upload. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export type ServiceImageErrorKind = 'too-large' | 'wrong-type' | 'failed';

export class ServiceImageError extends Error {
  constructor(readonly kind: ServiceImageErrorKind, cause?: unknown) {
    super(kind);
    this.name = 'ServiceImageError';
    this.cause = cause;
  }
}

/**
 * Upload a cover image and return its public URL.
 *
 * The path is `<lab_id>/<uuid>.<ext>` because the storage policies in 0025
 * read the first segment as the owning lab — the shape is what authorizes the
 * write, not a convention.
 */
export async function uploadServiceImage(labId: string, file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new ServiceImageError('wrong-type');
  if (file.size > MAX_IMAGE_BYTES) throw new ServiceImageError('too-large');

  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'png';
  const path = `${labId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(SERVICE_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new ServiceImageError('failed', error);

  return supabase.storage.from(SERVICE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Delete a previously uploaded cover.
 *
 * Best-effort: a cover that has already been replaced in the database is not
 * worth failing a save over, and only URLs from our own bucket are touched —
 * an old pasted-in URL from before 0025 is left alone.
 */
export async function removeServiceImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const marker = `/${SERVICE_IMAGE_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return;
  const path = url.slice(at + marker.length).split('?')[0];
  if (!path) return;
  await supabase.storage.from(SERVICE_IMAGE_BUCKET).remove([decodeURIComponent(path)]);
}
