import { createContext, useContext, useEffect } from 'react';

/**
 * The new-order form's section registry: every card on the page that the
 * section navigator should list, reported by the card itself.
 *
 * Generic on purpose. The navigator cannot know a template's sections — the
 * crown-and-bridge form has eight, a model order three, a lab can append its
 * own questions — so each `NumberedSection` registers itself while mounted,
 * and the wizard's own cards (patient, files, due date) do the same through
 * `useRegisterSection`. Outside a `SectionRegistryProvider` (its own file, for fast refresh) (the edit page,
 * an order's detail screen) registering is a no-op.
 *
 * Order is the page's: entries are sorted by where their element sits in the
 * DOM, so a template that renders a section conditionally slots into place
 * without anyone numbering anything.
 */
export type SectionEntry = {
  /** DOM id of the section's element — the scroll target. Unique per page. */
  id: string;
  /** The navigator line as shown: "1 · მკურნალობა". */
  label: string;
  /** The same section named in a sentence ("…left: shade and due date"). */
  name: string;
  /** Counts towards the "required N / M" note. */
  required: boolean;
  /**
   * Whether the section is complete, when its owner knows. Left undefined by
   * a template that does not say; the provider's `resolve` then decides.
   */
  done?: boolean;
  /** DOM-derived: the section holds at least one answer. */
  filled?: boolean;
  /** DOM-derived: the section is showing a validation error. */
  invalid?: boolean;
  /** `form` for the lab's form sections; `wizard` for the page's own cards. */
  kind: 'form' | 'wizard';
};

export type Registry = {
  register: (entry: SectionEntry) => void;
  unregister: (id: string) => void;
};

// Three contexts, so a section registering itself does not re-render every
// other section: the register functions never change, the list does.
export const RegistryContext = createContext<Registry | null>(null);
export const EntriesContext = createContext<SectionEntry[]>([]);
export const StatusContext = createContext<ReadonlyMap<string, boolean> | null>(null);

export const sameEntry = (a: SectionEntry | undefined, b: SectionEntry) =>
  !!a &&
  a.label === b.label &&
  a.name === b.name &&
  a.required === b.required &&
  a.done === b.done &&
  a.filled === b.filled &&
  a.invalid === b.invalid &&
  a.kind === b.kind;

/** Document order; an entry whose element is gone sorts last. */
export function byDomPosition(a: SectionEntry, b: SectionEntry): number {
  const ea = document.getElementById(a.id);
  const eb = document.getElementById(b.id);
  if (!ea || !eb) return ea ? -1 : eb ? 1 : 0;
  const pos = ea.compareDocumentPosition(eb);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

/**
 * Register a section for as long as the caller is mounted. Pass `null` to opt
 * out (a read-only rendering). A no-op outside a provider.
 */
export function useRegisterSection(entry: SectionEntry | null): void {
  const registry = useContext(RegistryContext);
  const id = entry?.id;

  useEffect(() => {
    if (registry && entry) registry.register(entry);
  });

  useEffect(() => {
    if (!registry || !id) return;
    return () => registry.unregister(id);
  }, [registry, id]);
}

/** Every registered section, in page order. */
export function useSections(): SectionEntry[] {
  return useContext(EntriesContext);
}

/** Every section's resolved done state, by id. */
export function useSectionStatuses(): ReadonlyMap<string, boolean> {
  return useContext(StatusContext) ?? EMPTY_STATUS;
}
const EMPTY_STATUS: ReadonlyMap<string, boolean> = new Map();

/** The resolved done state of one section; undefined outside a provider. */
export function useSectionDone(id: string): boolean | undefined {
  return useContext(StatusContext)?.get(id);
}

/**
 * The DOM probes behind `filled` and `invalid`, shared by every section so
 * they agree on what an answer looks like.
 *
 * `filled` is deliberately conservative. A pressed option only counts inside
 * a group marked `data-clearable` — an answer the doctor can take back — so a
 * mode toggle that is always on (tooth notation, shade scale) never makes an
 * untouched section look answered. A component with no such control can mark
 * itself `data-filled="true"`.
 */
export function probeSection(root: HTMLElement | null): { filled: boolean; invalid: boolean } {
  if (!root) return { filled: false, invalid: false };
  const invalid = !!root.querySelector('[data-form-error="true"], [aria-invalid="true"]');
  if (
    root.querySelector(
      '[data-filled="true"], [data-clearable="true"] [aria-pressed="true"], input[type="checkbox"]:checked, input[type="radio"]:checked',
    )
  ) {
    return { filled: true, invalid };
  }
  for (const el of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea',
  )) {
    if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file') continue;
    // A select's value lives in MUI's hidden native input.
    const isSelect = el.classList.contains('MuiSelect-nativeInput');
    // MUI's multiline autosize keeps an aria-hidden shadow copy of the text.
    if (!isSelect && (el.readOnly || el.disabled || el.getAttribute('aria-hidden') === 'true')) {
      continue;
    }
    if (el.value.trim()) return { filled: true, invalid };
  }
  return { filled: false, invalid };
}
