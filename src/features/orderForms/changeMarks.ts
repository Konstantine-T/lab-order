import { createContext, useContext, useEffect } from 'react';

/**
 * Which sections of a read-only form a doctor's edit touched, so the form can
 * mark them itself instead of the lab comparing two full copies by eye.
 *
 * Provided only by the lab's edit review (`OrderAnswersDiff`). `null`, the
 * default, means no highlighting: every other rendering of a form, the wizard
 * included, is untouched.
 */
export type ChangeMarks = {
  /**
   * Template sections, by the heading the form renders (translated, without
   * the required "*"), jaw-qualified as `upper|<heading>` where it applies.
   */
  labels: ReadonlySet<string>;
  /** Field codes of the lab's custom questions. */
  codes: ReadonlySet<string>;
  /** Answers before the edit, to show under a changed custom question. */
  before?: Record<string, unknown>;
  /** Called with a section's mark id once it has drawn a mark. */
  onMatched?: (markId: string) => void;
};

export const ChangeMarksContext = createContext<ChangeMarks | null>(null);

/**
 * Set around one jaw's block of the surgical guide, which asks the same five
 * questions of each jaw: without it a change to the upper jaw would mark the
 * lower jaw's section of the same name too.
 *
 * `prefix` is the text the form puts before each heading in that block (the
 * jaw's name on a both-jaws case, else empty), stripped before matching so the
 * key does not depend on which jaws the answers happen to cover.
 */
export const JawContext = createContext<{ jaw: 'upper' | 'lower'; prefix: string } | null>(null);

/** The id a marked template section carries in `data-changed-section`. */
export function sectionMarkId(label: string, jaw?: 'upper' | 'lower'): string {
  return jaw ? `s:${jaw}|${label}` : `s:${label}`;
}

/** The same for one of the lab's own questions, by field code. */
export function questionMarkId(code: string): string {
  return `q:${code}`;
}

// ===== useChangeMark =======================================================
/**
 * Whether the lab's edit review marks this section as changed, and the id it
 * is marked under. Only a read-only rendering is ever marked.
 *
 * - With `changeKey` (a custom question's field code) the section is changed
 *   when that code is, and only then. It never falls back to the heading: a
 *   lab can call its own question "Shade".
 * - Without it the heading is matched against the template's section names,
 *   jaw-qualified inside a surgical guide's `JawContext`.
 *
 * Reports every mark it draws through `onMatched`, so the review can tell a
 * change that no section drew and fall back to showing the previous version.
 */
export function useChangeMark(
  label: string,
  changeKey?: string,
  /** False in the wizard's card chrome, which is never marked. */
  active = true,
): { changed: boolean; markId: string } {
  const marks = useContext(ChangeMarksContext);
  const jaw = useContext(JawContext);

  let markId: string;
  let changed = false;
  if (changeKey !== undefined) {
    markId = questionMarkId(changeKey);
    changed = !!marks && marks.codes.has(changeKey);
  } else {
    const base =
      jaw && jaw.prefix && label.startsWith(jaw.prefix) ? label.slice(jaw.prefix.length) : label;
    const key = jaw ? `${jaw.jaw}|${base}` : base;
    markId = sectionMarkId(base, jaw?.jaw);
    changed = !!marks && marks.labels.has(key);
  }
  if (!active) changed = false;

  const onMatched = marks?.onMatched;
  useEffect(() => {
    if (changed) onMatched?.(markId);
  });

  return { changed, markId };
}
