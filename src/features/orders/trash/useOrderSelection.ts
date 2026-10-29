import { useCallback, useState } from 'react';

/**
 * Select mode on an orders list (C1, bulk): checkboxes on the finished rows
 * only, then "Move to trash (N)".
 */
export function useOrderSelection() {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const setMany = useCallback((list: string[]) => setIds(new Set(list)), []);
  const start = useCallback(() => setActive(true), []);
  const stop = useCallback(() => {
    setActive(false);
    setIds(new Set());
  }, []);

  return { active, ids, toggle, setMany, start, stop };
}

export type OrderSelection = ReturnType<typeof useOrderSelection>;
