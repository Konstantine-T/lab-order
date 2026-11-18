/**
 * The lab's explanation of its final price (to75nCxF, migrations 0046, 0061).
 *
 * The database insists that a new or changed price carries a non-empty note
 * (`final_price_note_required`) unless the price is the calculated estimate
 * (`isNoteRequired`). The owner's other rule — when the price changes, the
 * explanation is updated with it — can only be checked here: the lab either
 * edits the text or confirms the old text still holds.
 */

/** `orders.final_price_note`'s CHECK. */
export const FINAL_PRICE_NOTE_MAX = 1000;

/** A money figure in tetri, so two amounts compare as the database rounds them. */
const tetri = (amount: number | string) => Math.round(Number(amount) * 100);

/**
 * Whether a final price of `amount` needs an explanation: always, unless it is
 * the calculated estimate to the tetri. No estimate (a described service, or
 * none calculable) means always. The trigger's rule (0061), word for word:
 * `generated_total is null or round(final_total, 2) <> round(generated_total, 2)`.
 * `amount` null (nothing typed yet, or not a number) counts as not the estimate.
 */
export function isNoteRequired(
  amount: number | null,
  generatedTotal: number | string | null | undefined,
): boolean {
  if (generatedTotal == null || amount === null) return true;
  return tetri(amount) !== tetri(generatedTotal);
}

/**
 * Whether saving `amount` with `note` needs the lab's "the explanation is
 * still correct" confirmation: the price moves away from the stored one while
 * an explanation is already stored and the text is left as it was. Not when
 * the new price is the estimate: no explanation is needed there, so the lab
 * may keep, edit or clear the old one without vouching for it.
 */
export function needsNoteConfirmation(
  amount: number | null,
  note: string,
  saved: {
    final_total: number | null;
    final_price_note: string | null;
    generated_total: number | null;
  },
): boolean {
  const savedNote = (saved.final_price_note ?? '').trim();
  if (amount === null || savedNote === '') return false;
  if (!isNoteRequired(amount, saved.generated_total)) return false;
  const savedAmount = saved.final_total == null ? null : Number(saved.final_total);
  return amount !== savedAmount && note.trim() === savedNote;
}

/** The trigger's refusal (0046), whatever wording PostgREST wraps it in. */
export function isNoteRequiredError(error: unknown): boolean {
  const e = error as { message?: unknown } | null;
  return typeof e?.message === 'string' && e.message.includes('final_price_note_required');
}
