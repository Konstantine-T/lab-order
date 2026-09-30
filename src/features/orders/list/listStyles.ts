/**
 * The phone's square "new order" button beside the header search. `&&` so it
 * keeps its size against `PageHeader`'s rule that stretches every action on a
 * phone.
 */
export const PHONE_ADD_SX = {
  display: { xs: 'inline-flex', sm: 'none' },
  '&&': { flex: '0 0 auto' },
  minWidth: 40,
  width: 40,
  height: 40,
  p: 0,
} as const;
