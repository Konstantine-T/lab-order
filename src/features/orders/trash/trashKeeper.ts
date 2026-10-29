/**
 * Who keeps the orders this side deletes, for the confirm text: the lab for a
 * doctor or a buying lab, the doctor (or the lab that ordered) for a lab, and
 * both kinds for a lab's mixed selection.
 */
export type TrashKeeper = 'lab' | 'doctor' | 'buyerLab' | 'customers';

/** The lab side's keeper of a set of orders, from `buyer_lab_id` (0048). */
export function labSideKeeper(rows: { buyer_lab_id: string | null }[]): TrashKeeper {
  const labs = rows.filter((r) => r.buyer_lab_id != null).length;
  if (labs === 0) return 'doctor';
  return labs === rows.length ? 'buyerLab' : 'customers';
}
