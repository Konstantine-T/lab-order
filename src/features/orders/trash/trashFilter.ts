/**
 * The trash filter every order list of a side uses (0054), in a module of its
 * own so a list (or the order wizard, which the guest chunk shares) pulls in
 * nothing else.
 *
 * Add `ORDER_TRASH_EMBED` to the select and `.is('order_trash', null)`: the
 * orders with no `order_trash` row the caller can read. RLS returns only the
 * caller's own side's rows (an order is never both a lab's incoming order and
 * its own purchase, 0048), so no side filter is needed, and in the trash or
 * gone both count as hidden. Server-side, so pagination and counts are right.
 */
export const ORDER_TRASH_EMBED = 'order_trash(id)';

/** Add to an order page's select: its side's row, if any (C3). */
export const ORDER_TRASH_STATE_EMBED = 'order_trash(purge_after)';
