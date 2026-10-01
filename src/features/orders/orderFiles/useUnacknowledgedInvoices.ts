import { useInvoiceOrderIds } from './useInvoiceOrderIds';

/**
 * Which of the doctor's (or, with no `doctorId`, the clinic's) orders carry an
 * invoice they have not acknowledged — including one replaced since they last
 * looked. A thin wrapper so the doctor and clinic lists keep their call sites;
 * the query and the acknowledgement test live once, in `useInvoiceOrderIds`.
 */
export function useUnacknowledgedInvoices(
  scope: { doctorId?: string; enabled?: boolean } = {},
): ReadonlySet<string> {
  return useInvoiceOrderIds({ ...scope, unacknowledgedOnly: true });
}
