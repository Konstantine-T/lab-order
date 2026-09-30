import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  byDomPosition,
  EntriesContext,
  RegistryContext,
  sameEntry,
  StatusContext,
  type SectionEntry,
} from './sectionRegistry';

/**
 * Holds the registry for one page. `resolve` turns an entry into the one
 * done/not-done answer the navigator dot and the section's badge both show,
 * so the two can never disagree.
 */
export function SectionRegistryProvider({
  resolve,
  children,
}: {
  resolve: (entry: SectionEntry) => boolean;
  children: ReactNode;
}) {
  const [byId, setById] = useState<Record<string, SectionEntry>>({});

  const register = useCallback((entry: SectionEntry) => {
    // Registration runs after every render of a section, so an unchanged
    // entry must not produce a new object — that would loop.
    setById((prev) => (sameEntry(prev[entry.id], entry) ? prev : { ...prev, [entry.id]: entry }));
  }, []);
  const unregister = useCallback((id: string) => {
    setById((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);
  const registry = useMemo(() => ({ register, unregister }), [register, unregister]);

  // Sorted at read time rather than on registration: a section's element is
  // in the DOM by the time its effect registers it, but its neighbours may
  // register in any order.
  const entries = useMemo(() => Object.values(byId).sort(byDomPosition), [byId]);
  const status = useMemo(
    () => new Map(entries.map((e) => [e.id, resolve(e)] as const)),
    [entries, resolve],
  );

  return (
    <RegistryContext.Provider value={registry}>
      <EntriesContext.Provider value={entries}>
        <StatusContext.Provider value={status}>{children}</StatusContext.Provider>
      </EntriesContext.Provider>
    </RegistryContext.Provider>
  );
}
