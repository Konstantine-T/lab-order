/**
 * The lab's explanation of its final price (to75nCxF, migration 0046).
 *
 * The database only insists that a new or changed price carries a non-empty
 * note (`final_price_note_required`). The owner's other rule — when the price
 * changes, the explanation is updated with it — can only be checked here: the
 * lab either edits the text or confirms the old text still holds.
 */

/** `orders.final_price_note`'s CHECK. */
export const FINAL_PRICE_NOTE_MAX = 1000;

/**
 * Whether saving `amount` with `note` needs the lab's "the explanation is
 * still correct" confirmation: the price moves away from the stored one while
 * an explanation is already stored and the text is left as it was.
 */
export function needsNoteConfirmation(
  amount: number | null,
  note: string,
  saved: { final_total: number | null; final_price_note: string | null },
): boolean {
  const savedNote = (saved.final_price_note ?? '').trim();
  if (amount === null || savedNote === '') return false;
  const savedAmount = saved.final_total == null ? null : Number(saved.final_total);
  return amount !== savedAmount && note.trim() === savedNote;
}

/** The trigger's refusal (0046), whatever wording PostgREST wraps it in. */
export function isNoteRequiredError(error: unknown): boolean {
  const e = error as { message?: unknown } | null;
  return typeof e?.message === 'string' && e.message.includes('final_price_note_required');
}
