import { supabase } from '@/lib/supabase';
import type { FileSource, OrderFileRow, UserRole } from '@/types/database';

export const ORDER_FILES_BUCKET = 'order-files';

/** The bucket's own limit (phase4-6.sql). Checked client-side too so an
 *  oversized file fails instantly instead of after a long upload. */
export const MAX_ORDER_FILE_BYTES = 100 * 1024 * 1024;

/** Why an upload failed, in terms the UI can translate. Never show the raw
 *  Supabase message — it's English-only and mentions RLS at the user. */
export type OrderFileErrorKind =
  | 'tooLarge'
  | 'network'
  | 'permission'
  | 'duplicate'
  | 'generic';

export class OrderFileError extends Error {
  kind: OrderFileErrorKind;
  fileName: string;
  constructor(kind: OrderFileErrorKind, fileName: string, cause?: unknown) {
    super(`order-file ${kind}: ${fileName}`);
    this.kind = kind;
    this.fileName = fileName;
    this.cause = cause;
  }
}

/** Map whatever Supabase/storage threw onto one of our kinds. Matching is on
 *  message text because supabase-js doesn't give storage errors a stable code. */
function classify(err: unknown): OrderFileErrorKind {
  const status = (err as { statusCode?: string | number; status?: number })?.statusCode
    ?? (err as { status?: number })?.status;
  const msg = String((err as { message?: string })?.message ?? '').toLowerCase();

  if (String(status) === '413' || msg.includes('too large') || msg.includes('exceeded the maximum')) {
    return 'tooLarge';
  }
  if (String(status) === '409' || msg.includes('already exists') || msg.includes('duplicate')) {
    return 'duplicate';
  }
  if (
    String(status) === '403'
    || String(status) === '401'
    || msg.includes('row-level security')
    || msg.includes('violates row-level')
    || msg.includes('unauthorized')
    || msg.includes('permission')
  ) {
    return 'permission';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) {
    return 'network';
  }
  return 'generic';
}

/** Keep the stored name readable but path-safe. The UUID prefix (added by the
 *  caller) is what actually guarantees uniqueness, so this can be lossy. */
function sanitize(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-120); // keep the extension end if the name is absurdly long
}

function uuid(): string {
  return typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Storage key for a new attachment.
 *
 * The shape is load-bearing, not cosmetic: every RLS policy on this bucket
 * reads element [2] of the path as the order id. Change the shape and uploads
 * silently become unauthorized.
 */
export function orderFilePath(labId: string, orderId: string, fileName: string): string {
  return `${labId}/${orderId}/${uuid()}-${sanitize(fileName)}`;
}

export type UploadTarget = { id: string; lab_id: string };

/**
 * Upload one file and record it.
 *
 * Storage first, then the row: a row pointing at a missing object would render
 * as a broken download, whereas an object with no row is invisible and
 * harmless. If the row insert fails we roll the object back so we don't leave
 * paid-for bytes nobody can see.
 */
export async function uploadOrderFile(
  order: UploadTarget,
  file: File,
  uploadedByUserId: string,
  uploadedByRole: UserRole,
  source: FileSource = 'ORDER_FORM',
): Promise<OrderFileRow> {
  if (file.size > MAX_ORDER_FILE_BYTES) {
    throw new OrderFileError('tooLarge', file.name);
  }

  const path = orderFilePath(order.lab_id, order.id, file.name);

  const { error: upErr } = await supabase.storage
    .from(ORDER_FILES_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (upErr) throw new OrderFileError(classify(upErr), file.name, upErr);

  const payload = {
    order_id: order.id,
    uploaded_by_user_id: uploadedByUserId,
    uploaded_by_role: uploadedByRole,
    storage_path: path,
    file_name: file.name,
    file_type: file.type || 'application/octet-stream',
    file_size_bytes: file.size,
    file_source: source,
  };

  const { data, error } = await supabase
    .from('order_files')
    .insert(payload)
    .select()
    .single();

  if (error) {
    // Best-effort cleanup; if this also fails the object is simply orphaned.
    await supabase.storage.from(ORDER_FILES_BUCKET).remove([path]).catch(() => {});
    throw new OrderFileError(classify(error), file.name, error);
  }

  return data as OrderFileRow;
}

export async function listOrderFiles(orderId: string): Promise<OrderFileRow[]> {
  const { data, error } = await supabase
    .from('order_files')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrderFileRow[];
}

/** Row first here: dropping the object first would leave a row rendering a
 *  download that 404s if the row delete then failed. */
export async function removeOrderFile(file: OrderFileRow): Promise<void> {
  const { error } = await supabase.from('order_files').delete().eq('id', file.id);
  if (error) throw new OrderFileError(classify(error), file.file_name, error);
  const { error: storageErr } = await supabase.storage
    .from(ORDER_FILES_BUCKET)
    .remove([file.storage_path]);
  if (storageErr) throw new OrderFileError(classify(storageErr), file.file_name, storageErr);
}

/** The bucket is private, so a URL has to be minted per view. Short-lived
 *  because it's handed straight to a click. */
export async function getOrderFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ORDER_FILES_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error || !data?.signedUrl) throw new OrderFileError(classify(error), storagePath, error);
  return data.signedUrl;
}

/** 1536 → "1.5 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

/** A Material Symbols name for a mime type — the chips read better with a hint
 *  of what the file is. */
export function fileIconFor(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'draft';
  return 'draft';
}
