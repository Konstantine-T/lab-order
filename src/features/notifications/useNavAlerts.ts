import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { OrderStatus } from '@/types/database';

/**
 * The red counts on the sidebar.
 *
 * Every count is derived from live state rather than from a per-user "seen"
 * flag: a badge means *something here is waiting on you*, so it appears the
 * moment the work arrives, is identical on every device you sign in from, and
 * clears itself when you actually deal with the thing — never because you
 * happened to glance at the page once.
 *
 * They are counted with `head: true`, so no rows cross the wire, and refreshed
 * on an interval as well as on window focus: coming back to a tab that has been
 * open all afternoon should not show yesterday's numbers.
 */
const REFRESH_MS = 60_000;

const shared = { staleTime: 30_000, refetchInterval: REFRESH_MS, refetchOnWindowFocus: true };

/** Statuses where the ball is in the doctor's court. */
const AWAITING_DOCTOR: OrderStatus[] = [
  // The lab asked a question and cannot proceed until it is answered.
  'NEEDS_CLARIFICATION',
  // The lab has handed the case over; only the doctor can close it (0022).
  'SENT_TO_CLINIC',
  'RECEIVED_BY_CLINIC',
];

/** A count-only read: `head` keeps the rows themselves off the wire. */
const orderCount = () => supabase.from('orders').select('id', { count: 'exact', head: true });

/** Lab: orders that arrived and have not been acknowledged, and unreviewed edits. */
export function useLabNavAlerts(labId: string | undefined) {
  const { data } = useQuery({
    queryKey: ['nav-alerts', 'lab', labId],
    enabled: !!labId,
    ...shared,
    queryFn: async () => {
      const [arrived, edited] = await Promise.all([
        orderCount().eq('lab_id', labId!).eq('status', 'SUBMITTED'),
        orderCount().eq('lab_id', labId!).eq('has_unreviewed_edits', true),
      ]);
      return { orders: arrived.count ?? 0, editedOrders: edited.count ?? 0 };
    },
  });
  return data ?? { orders: 0, editedOrders: 0 };
}

/** Doctor: their own orders that are waiting on them. */
export function useDoctorNavAlerts(doctorId: string | undefined) {
  const { data } = useQuery({
    queryKey: ['nav-alerts', 'doctor', doctorId],
    enabled: !!doctorId,
    ...shared,
    queryFn: async () => {
      const { count } = await orderCount()
        .eq('doctor_id', doctorId!)
        .in('status', AWAITING_DOCTOR);
      return { orders: count ?? 0 };
    },
  });
  return data ?? { orders: 0 };
}

/**
 * Clinic: the same waiting-on-a-doctor orders, across every doctor under the
 * clinic. RLS already limits the read to those doctors, so there is no filter.
 */
export function useClinicNavAlerts(clinicId: string | undefined) {
  const { data } = useQuery({
    queryKey: ['nav-alerts', 'clinic', clinicId],
    enabled: !!clinicId,
    ...shared,
    queryFn: async () => {
      const { count } = await orderCount().in('status', AWAITING_DOCTOR);
      return { orders: count ?? 0 };
    },
  });
  return data ?? { orders: 0 };
}

/** Platform admin: labs sitting in the approval queue. */
export function useAdminNavAlerts() {
  const { data } = useQuery({
    queryKey: ['nav-alerts', 'admin'],
    ...shared,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('labs')
        .select('id', { count: 'exact', head: true })
        .eq('approval_status', 'PENDING_APPROVAL');
      if (error) return { labs: 0 };
      return { labs: count ?? 0 };
    },
  });
  return data ?? { labs: 0 };
}
