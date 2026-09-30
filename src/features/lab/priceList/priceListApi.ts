import { supabase } from '@/lib/supabase';
import type { LabPriceListEntry, LabPriceLists, LabTextLang } from '@/types/database';
import { LAB_TEXT_LANGS } from '@/features/lab/labText';

/**
 * A lab's price lists: up to three optional files, one per language, in the
 * public `lab-price-lists` bucket (0038). The catalogue is public — guests see
 * the button too — so the files are world-readable by design.
 *
 * Path convention: `<lab_id>/<lang>.<ext>`. The storage policies read the
 * folder as the owning lab and the file name as the language, so the shape is
 * what authorizes the write, not a convention.
 */
export const PRICE_LIST_BUCKET = 'lab-price-lists';

/** The bucket's own limit (0038). Checked here too so an oversized file fails
 *  instantly instead of after a long upload. */
export const MAX_PRICE_LIST_BYTES = 10 * 1024 * 1024;

/** Allowed types and the extension each is stored under. */
const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const TYPE_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/** For the file picker's `accept`. */
export const PRICE_LIST_ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';

/** Why an upload or removal failed, in terms the UI can translate. Never show
 *  the raw Supabase message — it is English-only and mentions RLS at the user. */
export type PriceListErrorKind = 'wrongType' | 'tooLarge' | 'network' | 'permission' | 'generic';

export class PriceListError extends Error {
  kind: PriceListErrorKind;
  constructor(kind: PriceListErrorKind, cause?: unknown) {
    super(`price-list ${kind}`);
    this.name = 'PriceListError';
    this.kind = kind;
    this.cause = cause;
  }
}

/** Map whatever Supabase threw onto one of our kinds — on message text, since
 *  supabase-js gives storage errors no stable code (see orderFilesApi). */
function classify(err: unknown): PriceListErrorKind {
  const status =
    (err as { statusCode?: string | number })?.statusCode ?? (err as { status?: number })?.status;
  const msg = String((err as { message?: string })?.message ?? '').toLowerCase();

  if (msg.includes('not_your_lab')) return 'permission';
  if (msg.includes('invalid_price_list_type') || msg.includes('mime type')) return 'wrongType';
  if (
    String(status) === '413' ||
    msg.includes('too large') ||
    msg.includes('exceeded the maximum')
  ) {
    return 'tooLarge';
  }
  if (
    String(status) === '403' ||
    String(status) === '401' ||
    msg.includes('row-level security') ||
    msg.includes('unauthorized') ||
    msg.includes('permission')
  ) {
    return 'permission';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) {
    return 'network';
  }
  return 'generic';
}

/** The content type to store a picked file under, or null when not allowed.
 *  Some systems hand back an empty `file.type` for a PDF; the extension is the
 *  fallback. */
function contentTypeOf(file: File): string | null {
  if (EXT_BY_TYPE[file.type]) return file.type;
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  return TYPE_BY_EXT[ext] ?? null;
}

const isEntry = (v: unknown): v is LabPriceListEntry =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as LabPriceListEntry).path === 'string' &&
  typeof (v as LabPriceListEntry).name === 'string' &&
  typeof (v as LabPriceListEntry).uploaded_at === 'string';

/** Defensive read of `labs.price_lists`; also covers the column not existing
 *  yet (undefined) before 0038 is applied. */
export function coercePriceLists(raw: unknown): LabPriceLists {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: LabPriceLists = {};
  for (const lang of LAB_TEXT_LANGS) {
    const v = (raw as Record<string, unknown>)[lang];
    if (isEntry(v) && v.path) out[lang] = v;
  }
  return out;
}

/**
 * The file a reader should get: the one in their UI language, else the first
 * that exists in the order ka → en → ru. Null when the lab has none.
 */
export function pickPriceList(raw: unknown, lang: string): LabPriceListEntry | null {
  const lists = coercePriceLists(raw);
  const code = lang.slice(0, 2);
  const order = [code, ...LAB_TEXT_LANGS.filter((l) => l !== code)];
  for (const l of order) {
    const entry = lists[l as LabTextLang];
    if (entry) return entry;
  }
  return null;
}

/** Public URL of a stored file. `?v=` changes whenever the file is replaced
 *  under the same path, so a CDN or browser copy of the old one isn't served. */
export function priceListUrl(entry: LabPriceListEntry): string {
  const base = supabase.storage.from(PRICE_LIST_BUCKET).getPublicUrl(entry.path).data.publicUrl;
  const v = Date.parse(entry.uploaded_at);
  return Number.isFinite(v) ? `${base}?v=${v}` : base;
}

type RpcResult = { price_lists: unknown; previous_path: string | null };

async function callSet(
  labId: string,
  lang: LabTextLang,
  path: string | null,
  name: string | null,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('set_lab_price_list', {
    p_lab_id: labId,
    p_lang: lang,
    p_path: path,
    p_name: name,
  });
  if (error) throw new PriceListError(classify(error), error);
  return (data ?? { price_lists: {}, previous_path: null }) as RpcResult;
}

/** Best-effort: a file nothing references any more is not worth failing over. */
async function removeObject(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage
    .from(PRICE_LIST_BUCKET)
    .remove([path])
    .catch(() => undefined);
}

/**
 * Upload (or replace) the price list for one language.
 *
 * Storage first, then the row, so a doctor is never handed a link to a file
 * that isn't there. When the new file has a different extension than the one
 * it replaces, the old object is removed afterwards; when the row update fails,
 * a newly created object is rolled back.
 */
export async function uploadPriceList(
  labId: string,
  lang: LabTextLang,
  file: File,
): Promise<LabPriceLists> {
  const contentType = contentTypeOf(file);
  if (!contentType) throw new PriceListError('wrongType');
  if (file.size > MAX_PRICE_LIST_BYTES) throw new PriceListError('tooLarge');

  const path = `${labId}/${lang}.${EXT_BY_TYPE[contentType]}`;
  // Read before writing: whether a failed row update may delete the new object
  // depends on whether the stored entry already points at this very path.
  const before = (await fetchPriceLists(labId).catch((e: unknown) => {
    throw new PriceListError(classify(e), e);
  }))[lang]?.path;

  const { error: upErr } = await supabase.storage
    .from(PRICE_LIST_BUCKET)
    .upload(path, file, { contentType, upsert: true, cacheControl: '3600' });
  if (upErr) throw new PriceListError(classify(upErr), upErr);

  let result: RpcResult;
  try {
    result = await callSet(labId, lang, path, file.name);
  } catch (e) {
    // Only roll back an object this call created. Overwriting the same path
    // already replaced the old bytes, and deleting would break the stored link.
    if (before !== path) await removeObject(path);
    throw e;
  }

  if (result.previous_path && result.previous_path !== path) {
    await removeObject(result.previous_path);
  }
  return coercePriceLists(result.price_lists);
}

/** Remove the price list for one language: the row first, then the file. */
export async function removePriceList(labId: string, lang: LabTextLang): Promise<LabPriceLists> {
  const result = await callSet(labId, lang, null, null);
  await removeObject(result.previous_path);
  return coercePriceLists(result.price_lists);
}

/** The lab's own price lists, for its profile page. */
export async function fetchPriceLists(labId: string): Promise<LabPriceLists> {
  const { data, error } = await supabase
    .from('labs')
    .select('price_lists')
    .eq('id', labId)
    .maybeSingle();
  if (error) throw error;
  return coercePriceLists((data as { price_lists?: unknown } | null)?.price_lists);
}
