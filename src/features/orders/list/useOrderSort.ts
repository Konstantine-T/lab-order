import { useCallback, useState } from 'react';
import { DEFAULT_ORDER_SORT, isOrderSort, type OrderSort } from '@/features/orders/orderDates';

/**
 * Which order list a remembered sort belongs to. Each area keeps its own: a lab
 * reading its production queue and a doctor tracking their own cases want
 * different things, and one shared key would have each overwrite the other.
 */
export type OrderSortArea = 'lab' | 'doctor' | 'clinic';

const storageKey = (area: OrderSortArea) => `lab-order:orderSort:${area}`;

/**
 * The stored choice, or newest first. `localStorage` throws in some private
 * modes, and an unrecognised value (an older build, a hand-edited key) must not
 * reach the comparator table — both fall back to the default.
 */
export function readOrderSort(area: OrderSortArea): OrderSort {
  try {
    const stored = localStorage.getItem(storageKey(area));
    return isOrderSort(stored) ? stored : DEFAULT_ORDER_SORT;
  } catch {
    return DEFAULT_ORDER_SORT;
  }
}

/** Remembers the choice; a full or blocked storage just means it is not kept. */
export function writeOrderSort(area: OrderSortArea, sort: OrderSort): void {
  try {
    localStorage.setItem(storageKey(area), sort);
  } catch {
    // Not remembered this time; the list still sorts.
  }
}

/** The list's sort, remembered per area across visits (`localStorage`). */
export function useOrderSort(area: OrderSortArea) {
  const [sort, setSortState] = useState<OrderSort>(() => readOrderSort(area));
  const setSort = useCallback(
    (next: OrderSort) => {
      setSortState(next);
      writeOrderSort(area, next);
    },
    [area],
  );
  return [sort, setSort] as const;
}
