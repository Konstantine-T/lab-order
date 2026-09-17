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
  /** The invoice RPCs raise these by name (0035); without them every refusal
   *  would read as a generic failure and tell the lab nothing. */
  | 'orderCancelled'
  | 'noInvoice'
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

  // The 0035 RPCs raise bare codes. Checked before the generic matchers below,
  // which would otherwise swallow `not_your_lab` into 'generic'.
  if (msg.includes('order_cancelled')) return 'orderCancelled';
  if (msg.includes('no_invoice')) return 'noInvoice';
  if (msg.includes('not_your_lab') || msg.includes('not_your_order')) return 'permission';

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

/**
 * The order's attachments — everything except the invoice.
 *
 * The invoice is an `order_files` row too (0035), but it has its own block
 * near the price on all four order screens. Without this filter it would also
 * sit among the doctor's STLs, so the same document would appear twice with
 * two different meanings.
 */
export async function listOrderFiles(orderId: string): Promise<OrderFileRow[]> {
  const { data, error } = await supabase
    .from('order_files')
    .select('*')
    .eq('order_id', orderId)
    .neq('file_source', 'INVOICE')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrderFileRow[];
}

/**
 * The order's current invoice, or null.
 *
 * `maybeSingle` rather than `single`: no invoice is the normal state — the
 * ticket's first decision is that it is optional — and an error here would
 * blank the whole price card over a document that was never required.
 */
export async function fetchOrderInvoice(orderId: string): Promise<OrderFileRow | null> {
  const { data, error } = await supabase
    .from('order_files')
    .select('*')
    .eq('order_id', orderId)
    .eq('file_source', 'INVOICE')
    .maybeSingle();
  if (error) throw error;
  return (data as OrderFileRow | null) ?? null;
}

/**
 * Attach or replace the order's invoice.
 *
 * Storage first, then one RPC that swaps the row and clears the doctor's
 * acknowledgement together. Doing those as separate client writes could leave
 * an order with a new invoice the doctor is never alerted to, or an alert with
 * no document behind it.
 *
 * The old object is removed best-effort afterwards; a failure there orphans
 * bytes rather than breaking the order, which is the same trade `uploadOrderFile`
 * already makes on its rollback path.
 */
export async function replaceOrderInvoice(
  order: UploadTarget,
  file: File,
): Promise<OrderFileRow> {
  if (file.size > MAX_ORDER_FILE_BYTES) {
    throw new OrderFileError('tooLarge', file.name);
  }

  const path = orderFilePath(order.lab_id, order.id, file.name);

  const { error: upErr } = await supabase.storage
    .from(ORDER_FILES_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (upErr) throw new OrderFileError(classify(upErr), file.name, upErr);

  const { data, error } = await supabase.rpc('replace_order_invoice', {
    p_order_id: order.id,
    p_storage_path: path,
    p_file_name: file.name,
    p_file_type: file.type || 'application/octet-stream',
    p_file_size_bytes: file.size,
  });

  if (error) {
    // The row never landed, so the object we just uploaded is unreferenced.
    await supabase.storage.from(ORDER_FILES_BUCKET).remove([path]).catch(() => {});
    throw new OrderFileError(classify(error), file.name, error);
  }

  // `returns table (...)` arrives as a one-row array.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { new_file_id: string; previous_storage_path: string | null }
    | undefined;
  const previous = row?.previous_storage_path;
  if (previous && previous !== path) {
    await supabase.storage.from(ORDER_FILES_BUCKET).remove([previous]).catch(() => {});
  }

  const invoice = await fetchOrderInvoice(order.id);
  if (!invoice) throw new OrderFileError('generic', file.name);
  return invoice;
}

/** The doctor (or the clinic acting for them) confirms they have seen it. */
export async function acknowledgeOrderInvoice(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('acknowledge_order_invoice', { p_order_id: orderId });
  if (error) throw new OrderFileError(classify(error), '', error);
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
