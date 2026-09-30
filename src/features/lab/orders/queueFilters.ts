/**
 * The lab queue's doctor and destination filters.
 *
 * Both lists are derived from the orders `/lab/orders` has already loaded — a
 * lab has no roster of doctors or clinics, it knows them only because they
 * sent it work. That is also the right semantics: the filter offers "doctors
 * who have ordered from me", not a platform-wide list. It inherits the page's
 * client-side limit: the list is only as complete as the rows fetched.
 *
 * The two grouping keys differ on purpose. A doctor is one person with one id,
 * so the doctor filter keys on `doctor_id`. A work location is not: the rows are
 * per-doctor, so five doctors at one clinic hold five different ids for the
 * same door. The destination filter keys on the normalised name instead.
 */

/** One entry in either filter's dropdown. */
export type QueueFilterOption = {
  /** What the filter stores and matches rows on. */
  key: string;
  /** Primary text: the doctor's name, or the clinic's. */
  label: string;
  /** Secondary text — `branch · city` for a destination. */
  detail?: string;
  /** Orders behind this option, counted over everything loaded — never the
   *  filtered set, or the numbers would shift as other filters are applied. */
  count: number;
  /** Newest `created_at` among those orders. The list sorts on it. */
  latestAt: string;
};

/** Most recent order first — the doctor who sent something yesterday is the
 *  one being looked for, not the one who ordered once in January. */
function byRecency(a: QueueFilterOption, b: QueueFilterOption): number {
  if (a.latestAt !== b.latestAt) return a.latestAt > b.latestAt ? -1 : 1;
  const byLabel = a.label.localeCompare(b.label);
  if (byLabel !== 0) return byLabel;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Trimmed, with internal runs of whitespace collapsed to one space. */
const tidy = (value: unknown): string =>
  typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : '';

// ===== Doctors ================================================================

type DoctorSource = {
  doctor_id: string;
  created_at: string;
  doctor_snapshot: { first_name?: string; last_name?: string } | null;
};

const doctorNameOf = (snap: DoctorSource['doctor_snapshot']): string =>
  [tidy(snap?.first_name), tidy(snap?.last_name)].filter(Boolean).join(' ');

/**
 * One entry per `doctor_id`, named from the most recent order that carries a
 * name. `doctor_snapshot` is frozen at submit time, so a doctor who changed
 * surname mid-year appears under two names across their orders: grouping by
 * name would split them in two, and merge two different doctors who share one.
 * Same approach as `_lab_receivables_rows` (0028).
 */
export function doctorOptionsFrom(rows: readonly DoctorSource[]): QueueFilterOption[] {
  const groups = new Map<string, QueueFilterOption>();
  // When the label was taken, so an older order never overwrites a newer name.
  const namedAt = new Map<string, string>();

  for (const row of rows) {
    if (!row.doctor_id) continue;
    const name = doctorNameOf(row.doctor_snapshot);
    const group = groups.get(row.doctor_id);
    if (!group) {
      groups.set(row.doctor_id, {
        key: row.doctor_id,
        label: name,
        count: 1,
        latestAt: row.created_at,
      });
      if (name) namedAt.set(row.doctor_id, row.created_at);
      continue;
    }
    group.count += 1;
    if (row.created_at > group.latestAt) group.latestAt = row.created_at;
    if (name && row.created_at > (namedAt.get(row.doctor_id) ?? '')) {
      group.label = name;
      namedAt.set(row.doctor_id, row.created_at);
    }
  }

  return [...groups.values()]
    .map((o) => (o.label ? o : { ...o, label: '—' }))
    .sort(byRecency);
}

// ===== Destinations ===========================================================

/**
 * The three snapshot fields the destination filter needs, selected as JSON
 * paths so the list query does not drag the whole snapshot across the wire.
 * Read from the snapshot, not a live join (CLAUDE.md): it is where the order
 * is going, as recorded on the order.
 */
export const DESTINATION_SELECT =
  'wl_clinic:work_location_snapshot->>clinic_name, ' +
  'wl_branch:work_location_snapshot->>branch_name, ' +
  'wl_city:work_location_snapshot->>city';

export type DestinationColumns = {
  wl_clinic: string | null;
  wl_branch: string | null;
  wl_city: string | null;
};

/**
 * Clinic + branch + city, trimmed, whitespace-collapsed and lower-cased, so
 * "dental plus " and "Dental Plus" are one entry. `address` is deliberately
 * left out: "Rustaveli 12" and "12 Rustaveli St." are the same door, and a
 * delivery filter that splits one address in two is the failure being avoided.
 *
 * Null when there is no clinic name — the snapshot is JSONB and nothing
 * constrains its shape, so a malformed one is skipped rather than grouped
 * under an empty key.
 */
export function destinationKeyOf(row: DestinationColumns): string | null {
  const clinic = tidy(row.wl_clinic).toLowerCase();
  if (!clinic) return null;
  return [clinic, tidy(row.wl_branch).toLowerCase(), tidy(row.wl_city).toLowerCase()].join(
    '\u001f',
  );
}

/** The display form: clinic name, and `branch · city` beneath it. */
export function destinationLabelOf(row: DestinationColumns): { clinic: string; detail: string } {
  return {
    clinic: tidy(row.wl_clinic),
    detail: [tidy(row.wl_branch), tidy(row.wl_city)].filter(Boolean).join(' · '),
  };
}

/** One entry per destination, labelled with its most recent order's spelling. */
export function destinationOptionsFrom(
  rows: readonly (DestinationColumns & { created_at: string })[],
): QueueFilterOption[] {
  const groups = new Map<string, QueueFilterOption>();

  for (const row of rows) {
    const key = destinationKeyOf(row);
    if (!key) continue;
    const group = groups.get(key);
    if (!group) {
      const { clinic, detail } = destinationLabelOf(row);
      groups.set(key, {
        key,
        label: clinic,
        detail: detail || undefined,
        count: 1,
        latestAt: row.created_at,
      });
      continue;
    }
    group.count += 1;
    if (row.created_at > group.latestAt) {
      group.latestAt = row.created_at;
      const { clinic, detail } = destinationLabelOf(row);
      group.label = clinic;
      group.detail = detail || undefined;
    }
  }

  return [...groups.values()].sort(byRecency);
}
