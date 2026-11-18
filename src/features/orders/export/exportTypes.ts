/**
 * What the orders export (`exportOrders`, loaded on the first click) needs
 * from a page. Kept apart from that module so a page imports only these few
 * lines; the spreadsheet library and the column code stay out of its chunk.
 */

/**
 * Whose orders, and the filter every fetch adds on top of the ids. Since 0048
 * a lab's owner reads both its incoming orders (the lab policy) and its own
 * purchases (as its buying profile), so a lab page and a purchase page never
 * rely on RLS alone. A clinic admin's RLS is exactly the clinic's orders.
 *
 * The kind is also the perspective the file is written from: which columns it
 * has, how the patient reads (a lab sees only the label, 0057), and whose
 * wording a status takes. A lab's purchases are the doctor's side.
 */
export type ExportScope =
  | { kind: 'lab'; labId: string }
  | { kind: 'doctor'; doctorId: string }
  | { kind: 'clinic' };

export type ExportPerspective = ExportScope['kind'];

/** Any `t` will do (the `common` namespace's); the export names its own namespaces. */
export type ExportTranslate = (key: string, options?: Record<string, unknown>) => string;

/** Above this many orders the button asks first. */
export const EXPORT_CONFIRM_ABOVE = 5000;

/**
 * `patient-1a2b3c4d` / `project-1a2b3c4d` for the file name: patients have no
 * code of their own, so the start of the record's id stands in. Never the
 * name: a file name travels further than the file's contents are meant to.
 */
export const patientFileTag = (prefix: 'patient' | 'project', patientId: string) =>
  `${prefix}-${patientId.slice(0, 8)}`;
