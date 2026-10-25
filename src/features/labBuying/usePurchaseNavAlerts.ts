import { useDoctorNavAlerts } from '@/features/notifications/useNavAlerts';

/**
 * The count on "My orders to labs" (0048, J5): the lab's purchase orders that
 * wait on the lab itself, exactly as the doctor's own sidebar counts them
 * (a question to answer, a change to make, a delivered case to close, an
 * invoice not yet seen).
 *
 * The doctor's counter, scoped to the buying profile: every count in it
 * filters `.eq('doctor_id', …)`, so the orders the lab receives (readable to
 * it through the lab policy) never enter this number, and none of these enter
 * the incoming badges, which filter on `lab_id`. Its key sits under
 * `['nav-alerts']`, which every order, clarification and file event refreshes.
 */
export function usePurchaseNavAlerts(buyerProfileId: string | null | undefined): number {
  return useDoctorNavAlerts(buyerProfileId ?? undefined).orders;
}
