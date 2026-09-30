import type { SectionEntry } from './sectionRegistry';

export type ProgressItem = { name: string; done: boolean };

/**
 * The required things an order needs before it can be sent, in page order —
 * the navigator's "required 3 / 5 filled in. Left: files and due date."
 *
 * Built from the same checks the submit gate runs (`collectOrderProblems`),
 * never from a fixed list: the patient's name, the lab's form, the due date,
 * and the work location where the doctor can pick one.
 *
 * The form is one item unless every one of its required sections reports its
 * own `done` — then each is listed by name, which is what the note is for.
 * Only a template can say exactly which of its sections is incomplete; a
 * guess from the page would name the wrong one. If those sections all say
 * done while the form still fails validation, the form is listed once more
 * under its own name, so the count can never claim "all done" over a submit
 * that would be refused.
 */
export function requiredProgress(input: {
  patient: ProgressItem;
  /** Absent when the lab's form asks nothing required (or has not loaded). */
  form?: { name: string; valid: boolean; sections: SectionEntry[] };
  due: ProgressItem;
  /** Absent for a guest, who picks a location only after signing in. */
  location?: ProgressItem;
}): { items: ProgressItem[]; done: number; total: number; missing: string[] } {
  const items: ProgressItem[] = [input.patient];

  if (input.form) {
    const { name, valid, sections } = input.form;
    const required = sections.filter((s) => s.kind === 'form' && s.required);
    const exact = required.length > 0 && required.every((s) => s.done !== undefined);
    if (exact) {
      for (const s of required) items.push({ name: s.name, done: valid || !!s.done });
      if (!valid && required.every((s) => s.done)) items.push({ name, done: false });
    } else {
      items.push({ name, done: valid });
    }
  }

  items.push(input.due);
  if (input.location) items.push(input.location);

  const done = items.filter((i) => i.done).length;
  return {
    items,
    done,
    total: items.length,
    missing: items.filter((i) => !i.done).map((i) => i.name),
  };
}

/**
 * "a, b and c". Not `Intl.ListFormat`: Chrome ships no Georgian locale data,
 * so it would join a Georgian sentence with an English "and".
 */
export function joinList(names: string[], and: string): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}
