import { useCallback, useEffect, useState } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';
import { useAuth } from '@/auth/AuthProvider';

export type OrdersView = 'list' | 'grid';

/** Every orders page with the list / grid switch. */
export type OrdersViewPage =
  | 'lab-orders'
  | 'lab-purchases'
  | 'lab-edited'
  | 'lab-project'
  | 'doctor-orders'
  | 'doctor-patient'
  | 'clinic-orders';

/**
 * Each page's view until the person picks one. The doctor keeps the grid it
 * has always had (J2); the clinic, the lab's pages (its purchases included:
 * the lab's area) and the per-patient / edited lists open as a list.
 */
export const ORDERS_VIEW_DEFAULTS: Record<OrdersViewPage, OrdersView> = {
  'lab-orders': 'list',
  'lab-purchases': 'list',
  'lab-edited': 'list',
  'lab-project': 'list',
  'doctor-orders': 'grid',
  'doctor-patient': 'list',
  'clinic-orders': 'list',
};

const isView = (v: unknown): v is OrdersView => v === 'list' || v === 'grid';

function read(key: string | null): OrdersView | null {
  if (!key) return null;
  try {
    const v = localStorage.getItem(key);
    return isView(v) ? v : null;
  } catch {
    // Storage blocked (a private window, cleared site data): the default.
    return null;
  }
}

/**
 * The page's list / grid view: remembered per page and per person in this
 * browser (`orders-view:<page>:<userId>`), the page's default otherwise.
 * Below `md` it is always the grid and `canSwitch` is false: a table does not
 * fit a phone (J3), and the stored choice is left alone for the desktop.
 */
export function useOrdersView(page: OrdersViewPage) {
  const { user } = useAuth();
  const key = user?.id ? `orders-view:${page}:${user.id}` : null;
  const fallback = ORDERS_VIEW_DEFAULTS[page];
  const [stored, setStored] = useState<OrdersView>(() => read(key) ?? fallback);

  // Another person signing in on this browser, or the session arriving after
  // the first render: their own choice.
  useEffect(() => {
    setStored(read(key) ?? fallback);
  }, [key, fallback]);

  const phone = useMediaQuery(useTheme().breakpoints.down('md'));

  const setView = useCallback(
    (next: OrdersView) => {
      setStored(next);
      if (!key) return;
      try {
        localStorage.setItem(key, next);
      } catch {
        // Not remembered; the switch still works for this visit.
      }
    },
    [key],
  );

  return { view: phone ? ('grid' as const) : stored, setView, canSwitch: !phone };
}
