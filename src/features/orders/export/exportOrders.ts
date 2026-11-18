import writeXlsxFile, { type Cell, type SheetData } from 'write-excel-file/browser';
import { supabase } from '@/lib/supabase';
import { pickText } from '@/features/lab/labText';
import { DESTINATION_SELECT, type DestinationColumns } from '@/features/lab/orders/queueFilters';
import { statusLabel } from '@/features/orders/statusLabel';
import type { InvoiceRecipientType, OrderStatus, PaymentStatus } from '@/types/database';
import type { ExportPerspective, ExportScope, ExportTranslate } from './exportTypes';

/**
 * The orders export: one sheet, one row per order, order details only (no
 * form answers). Loaded with `import()` on the first click (ExportOrdersButton),
 * so neither this file nor the spreadsheet library is in any page's chunk.
 *
 * The page hands over the ids of its filtered rows in the order it shows
 * them; the export columns are fetched fresh by id (the list queries select
 * only what a row draws), then put back in the page's order.
 */

/** Ids per request: 200 uuids keep the URL far under any proxy's limit. */
const CHUNK = 200;
/** Requests in flight at once. */
const PARALLEL = 4;

const DATE = 'yyyy-mm-dd';
const DATE_TIME = 'yyyy-mm-dd hh:mm';
const MONEY = '#,##0.00 "₾"';

/**
 * Every perspective's columns. JSON paths rather than whole snapshots, read
 * from the snapshots (what the order was placed with), not live rows: the
 * invoice recipient, the doctor, the service's name, the delivery place.
 */
const BASE_SELECT =
  'id, order_code, created_at, status, buyer_lab_id, patient_reference, ' +
  'requested_due_date, requested_due_time, confirmed_due_date, confirmed_due_time, ' +
  'completed_at, cancelled_at, generated_total, final_total, final_price_note, ' +
  'paid_total, payment_status, edit_count, invoice_recipient_type, ' +
  'invoice_name:invoice_recipient_snapshot->>name, ' +
  'invoice_code:invoice_recipient_snapshot->>identification_code, ' +
  'doctor_first:doctor_snapshot->>first_name, doctor_last:doctor_snapshot->>last_name, ' +
  'service_name:service_snapshot->>name, lab_services(name, translations), ' +
  DESTINATION_SELECT;

/**
 * A lab reads the patient only as the order's label (0057): it never embeds
 * `patients`. A doctor and a clinic admin read the record, and the lab.
 * `labs!orders_lab_id_fkey`: since 0048 a bare `labs(...)` is ambiguous.
 */
const DOCTOR_SELECT =
  `${BASE_SELECT}, patients(first_name, last_name), ` +
  'lab_name:lab_snapshot->>public_name, labs!orders_lab_id_fkey(public_name)';
const SELECT: Record<ExportPerspective, string> = {
  lab: `${BASE_SELECT}, patient_label`,
  doctor: DOCTOR_SELECT,
  clinic: DOCTOR_SELECT,
};

type Amount = number | string | null;

type ExportRow = DestinationColumns & {
  id: string;
  order_code: string;
  created_at: string;
  status: OrderStatus;
  buyer_lab_id: string | null;
  patient_reference: string | null;
  requested_due_date: string | null;
  requested_due_time: string | null;
  confirmed_due_date: string | null;
  confirmed_due_time: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  // PostgREST may hand a numeric over as a string: read through `amount()`.
  generated_total: Amount;
  final_total: Amount;
  final_price_note: string | null;
  paid_total: Amount;
  payment_status: PaymentStatus;
  edit_count: number | null;
  invoice_recipient_type: InvoiceRecipientType | null;
  invoice_name: string | null;
  invoice_code: string | null;
  doctor_first: string | null;
  doctor_last: string | null;
  service_name: string | null;
  lab_services: { name: string | null; translations: unknown } | null;
  /** Lab only. */
  patient_label?: string | null;
  /** Doctor and clinic only. */
  patients?: { first_name: string | null; last_name: string | null } | null;
  lab_name?: string | null;
  labs?: { public_name: string | null } | null;
};

// ===== Fetching ==============================================================

async function fetchChunk(scope: ExportScope, ids: string[]): Promise<ExportRow[]> {
  let query = supabase.from('orders').select(SELECT[scope.kind]).in('id', ids);
  // The page's own filter as well as the ids (see ExportScope).
  if (scope.kind === 'lab') query = query.eq('lab_id', scope.labId);
  else if (scope.kind === 'doctor') query = query.eq('doctor_id', scope.doctorId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ExportRow[];
}

/** The rows for `ids`, in the order of `ids`. */
async function fetchRows(scope: ExportScope, ids: readonly string[]): Promise<ExportRow[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const byId = new Map<string, ExportRow>();
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const batch = await Promise.all(chunks.slice(i, i + PARALLEL).map((c) => fetchChunk(scope, c)));
    for (const rows of batch) for (const row of rows) byId.set(row.id, row);
  }
  // An order gone since the list loaded (trashed in another tab) drops out.
  return ids.flatMap((id) => byId.get(id) ?? []);
}

// ===== Values ================================================================

const tidy = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

const amount = (v: Amount | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const cents = (n: number) => Math.round(n * 100) / 100;

const TBILISI = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tbilisi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * A wall-clock time as the library wants it: it writes a Date's UTC fields
 * as the cell's value, so the UTC fields here hold the Tbilisi clock.
 */
const wallClock = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min));

/** A timestamp as Tbilisi reads it; `dayOnly` drops the time, for a date column. */
function tbilisi(iso: string | null | undefined, dayOnly = false): Date | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const p = Object.fromEntries(TBILISI.formatToParts(at).map((x) => [x.type, x.value]));
  const [y, m, d] = [Number(p.year), Number(p.month), Number(p.day)];
  return dayOnly ? wallClock(y, m, d) : wallClock(y, m, d, Number(p.hour) % 24, Number(p.minute));
}

/** A due date column and its optional window start: already Tbilisi's clock. */
function dueAt(date: string | null, time: string | null): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!d) return null;
  const t = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  return wallClock(+d[1], +d[2], +d[3], t ? +t[1] : 0, t ? +t[2] : 0);
}

// ===== Cells =================================================================

/** Empty cells stay empty: no "—" a sum or a filter would trip over. */
const text = (v: string | null | undefined): Cell => {
  const s = tidy(v);
  return s ? { value: s, type: String } : null;
};
const money = (n: number | null): Cell => (n == null ? null : { value: n, type: Number, format: MONEY });
const when = (d: Date | null, format: string): Cell => (d ? { value: d, type: Date, format } : null);
const due = (date: string | null, time: string | null): Cell =>
  when(dueAt(date, time), time ? DATE_TIME : DATE);

type Context = { t: ExportTranslate; lang: string; perspective: ExportPerspective };

/** The patient as this side sees them, else (or as well) a purchase's case reference (0048). */
function patientOf(row: ExportRow, perspective: ExportPerspective): string {
  const name =
    perspective === 'lab'
      ? tidy(row.patient_label)
      : [tidy(row.patients?.first_name), tidy(row.patients?.last_name)].filter(Boolean).join(' ');
  const reference = tidy(row.patient_reference);
  return name && reference ? `${name} · ${reference}` : name || reference;
}

/** Who ordered. A purchase's "doctor" is the buying lab (0048), and says so. */
function customerOf(row: ExportRow, t: ExportTranslate): string {
  const name = [tidy(row.doctor_first), tidy(row.doctor_last)].filter(Boolean).join(' ');
  if (!name) return '';
  return row.buyer_lab_id != null ? t('orderExport.fromLab', { name }) : name;
}

/** The service in the reader's language (0042), else the name each side's list shows. */
function serviceOf(row: ExportRow, { lang, perspective }: Context): string {
  const snapshot = tidy(row.service_name);
  const live = tidy(row.lab_services?.name);
  // The lab's list names it as the lab does now; the doctor's as it was ordered.
  const base = perspective === 'lab' ? live || snapshot : snapshot || live;
  return pickText(base, row.lab_services?.translations, 'name', lang);
}

/** "Clinic: Dental Plus LLC, ს/კ 404123456", from the invoice snapshot. */
function invoiceOf(row: ExportRow, t: ExportTranslate): string {
  const name = tidy(row.invoice_name);
  const code = tidy(row.invoice_code);
  const who = [name, code ? t('labBuyer.idCode', { ns: 'doctor', code }) : '']
    .filter(Boolean)
    .join(', ');
  const kind = row.invoice_recipient_type
    ? t(`orderExport.invoiceTo.${row.invoice_recipient_type}`)
    : '';
  return kind && who ? `${kind}: ${who}` : who || kind;
}

/**
 * The estimate, or nothing: a LAB_DESCRIBED or NO_PRICING service has no
 * number (`generated_total` null), and an estimate of 0 is what older clients
 * stored for those (orderListModel's `priceOf`). Never a confident 0.
 */
function estimateOf(row: ExportRow): number | null {
  const n = amount(row.generated_total);
  return n != null && n > 0 ? n : null;
}

/** What is still owed, as the receivables count it (`_lab_receivables_rows`). */
function outstandingOf(row: ExportRow): number | null {
  const total = amount(row.final_total);
  if (total == null || row.status === 'CANCELLED') return null;
  return cents(Math.max(total - (amount(row.paid_total) ?? 0), 0));
}

type Column = {
  /** Under `common:orderExport.columns`. */
  key: string;
  /** In characters; widened to fit the header. */
  width: number;
  /** The perspectives that have it; every one when left out. */
  only?: readonly ExportPerspective[];
  cell: (row: ExportRow, ctx: Context) => Cell;
};

const COLUMNS: readonly Column[] = [
  { key: 'code', width: 16, cell: (r) => text(r.order_code) },
  { key: 'created', width: 17, cell: (r) => when(tbilisi(r.created_at), DATE_TIME) },
  {
    key: 'status',
    width: 22,
    // The lab's own wording where it differs (SUBMITTED reads "received").
    cell: (r, { t, perspective }) =>
      text(statusLabel(r.status, t, perspective === 'lab' ? 'lab' : 'doctor')),
  },
  { key: 'patient', width: 22, cell: (r, { perspective }) => text(patientOf(r, perspective)) },
  { key: 'doctor', width: 24, only: ['lab', 'clinic'], cell: (r, { t }) => text(customerOf(r, t)) },
  {
    key: 'lab',
    width: 22,
    only: ['doctor', 'clinic'],
    cell: (r) => text(tidy(r.lab_name) || r.labs?.public_name),
  },
  {
    key: 'clinic',
    width: 32,
    cell: (r) => text([tidy(r.wl_clinic), tidy(r.wl_branch), tidy(r.wl_city)].filter(Boolean).join(', ')),
  },
  { key: 'service', width: 28, cell: (r, ctx) => text(serviceOf(r, ctx)) },
  { key: 'requestedDue', width: 17, cell: (r) => due(r.requested_due_date, r.requested_due_time) },
  { key: 'confirmedDue', width: 17, cell: (r) => due(r.confirmed_due_date, r.confirmed_due_time) },
  { key: 'completed', width: 17, cell: (r) => when(tbilisi(r.completed_at), DATE_TIME) },
  { key: 'cancelled', width: 12, cell: (r) => when(tbilisi(r.cancelled_at, true), DATE) },
  { key: 'estimate', width: 14, cell: (r) => money(estimateOf(r)) },
  { key: 'finalPrice', width: 14, cell: (r) => money(amount(r.final_total)) },
  { key: 'priceNote', width: 40, cell: (r) => text(r.final_price_note) },
  { key: 'paid', width: 14, cell: (r) => money(amount(r.paid_total) ?? 0) },
  { key: 'outstanding', width: 14, cell: (r) => money(outstandingOf(r)) },
  { key: 'paymentStatus', width: 18, cell: (r, { t }) => text(t(`paymentStatus.${r.payment_status}`)) },
  { key: 'invoiceTo', width: 40, cell: (r, { t }) => text(invoiceOf(r, t)) },
  { key: 'edited', width: 10, cell: (r, { t }) => text(t((r.edit_count ?? 0) > 0 ? 'yes' : 'no')) },
  { key: 'editCount', width: 10, cell: (r) => ({ value: r.edit_count ?? 0, type: Number }) },
];

// ===== The workbook ==========================================================

/** "A", "B", …, "Z", "AA": a 1-based column's letters. */
function columnLetters(n: number): string {
  let s = '';
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The header row's filter buttons. The library has no option for them, so
 * this adds `<autoFilter>` straight after `<sheetData>` (where the schema
 * wants it, with nothing in between in what the library writes) and the
 * hidden `_xlnm._FilterDatabase` name Excel and LibreOffice pair it with.
 */
function autoFilter(sheet: string, columns: number, rows: number) {
  const last = columnLetters(columns);
  const ref = `A1:${last}${rows}`;
  const range = `'${sheet.replace(/'/g, "''")}'!$A$1:$${last}$${rows}`;
  const name = `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${escapeXml(range)}</definedName>`;
  return {
    files: {
      transform: {
        'xl/worksheets/sheet{id}.xml': {
          transform: (xml: string) => xml.replace('</sheetData>', `</sheetData><autoFilter ref="${ref}"/>`),
        },
        'xl/workbook.xml': {
          transform: (xml: string) =>
            xml.includes('<definedNames/>')
              ? xml.replace('<definedNames/>', `<definedNames>${name}</definedNames>`)
              : xml.includes('<definedNames>')
                ? xml.replace('<definedNames>', `<definedNames>${name}`)
                : xml.replace('<calcPr', `<definedNames>${name}</definedNames><calcPr`),
        },
      },
    },
  };
}

function buildWorkbook(rows: ExportRow[], ctx: Context): Promise<Blob> {
  const { t, perspective } = ctx;
  const columns = COLUMNS.filter((c) => !c.only || c.only.includes(perspective));
  const headers = columns.map((c) => t(`orderExport.columns.${c.key}`));
  const data: SheetData = [
    headers.map((value) => ({ value, type: String, fontWeight: 'bold' as const })),
    ...rows.map((row) => columns.map((c) => c.cell(row, ctx))),
  ];
  const sheet = t('orderExport.sheet');
  return writeXlsxFile(
    data,
    {
      sheet,
      // Wide enough for the header and its filter button.
      columns: columns.map((c, i) => ({ width: Math.max(c.width, headers[i].length + 3) })),
      stickyRowsCount: 1,
    },
    { features: [autoFilter(sheet, columns.length, data.length)] },
  ).toBlob();
}

/** Saved through a link; the URL is let go once the download has started. */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Not at once: some browsers read the URL after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 40_000);
}

/** Today in Tbilisi, `YYYY-MM-DD`, for the file name. */
const today = () => tbilisi(new Date().toISOString(), true)!.toISOString().slice(0, 10);

/**
 * Fetches the orders behind `ids`, writes them in that order and saves
 * `orders-<fileTag>-<today>.xlsx`. Throws on any failure; the button says so.
 */
export async function exportOrders({
  scope,
  ids,
  t,
  lang,
  fileTag,
}: {
  scope: ExportScope;
  ids: readonly string[];
  t: ExportTranslate;
  lang: string;
  fileTag: string;
}): Promise<void> {
  const rows = await fetchRows(scope, ids);
  // The list showed these orders a moment ago: none coming back is a failure
  // (a filter or a policy refusing them), never an empty file.
  if (ids.length > 0 && rows.length === 0) throw new Error('orders export: no rows returned');
  const blob = await buildWorkbook(rows, { t, lang, perspective: scope.kind });
  saveBlob(blob, `orders-${fileTag}-${today()}.xlsx`);
}
