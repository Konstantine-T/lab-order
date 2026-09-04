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
  // The lab needs the order changed. Unlike the one above there is no
  // "already answered" subtraction below: the status itself is cleared the
  // moment the doctor saves (0030), so being in it always means outstanding.
  'NEEDS_DOCTOR_INPUT',
  // The lab has handed the case over; only the doctor can close it (0022).
  'SENT_TO_CLINIC',
  'RECEIVED_BY_CLINIC',
];

/** A count-only read: `head` keeps the rows themselves off the wire. */
const orderCount = () => supabase.from('orders').select('id', { count: 'exact', head: true });

/**
 * Orders still sitting in NEEDS_CLARIFICATION whose question has been answered
 * — the doctor has replied and it is the lab's move again (0029).
 *
 * Both sides need this number: the lab as "go and read it", the doctor as the
 * orders to stop nagging about. It clears itself the moment the lab moves the
 * status on, which is why the status filter is part of the query rather than a
 * seen-flag.
 *
 * Counted as (orders with any clarification) − (orders with an open one)
 * because PostgREST cannot express "has an answered row AND no open row" in one
 * filter — and an order that was asked, answered, then asked again has both.
 */
async function answeredClarificationCount(
  scope: { column: 'lab_id' | 'doctor_id'; value: string } | null,
): Promise<number> {
  const build = () => {
    const q = supabase
      .from('orders')
      // `!inner` filters the orders down to those that have clarifications; the
      // count stays a count of orders, not of clarification rows.
      .select('id, order_clarifications!inner(id)', { count: 'exact', head: true })
      .eq('status', 'NEEDS_CLARIFICATION');
    return scope ? q.eq(scope.column, scope.value) : q;
  };

  const [withAny, stillOpen] = await Promise.all([
    build(),
    // Both columns: an edit request closed by a save has `answered_at` null
    // by design, and counting it as open pins the badge on forever.
    build()
      .is('order_clarifications.answered_at', null)
      .is('order_clarifications.resolved_by_edit_at', null),
  ]);
  return Math.max(0, (withAny.count ?? 0) - (stillOpen.count ?? 0));
}

/** Lab: new arrivals, unreviewed edits, and answers waiting to be read. */
export function useLabNavAlerts(labId: string | undefined) {
  const { data } = useQuery({
    queryKey: ['nav-alerts', 'lab', labId],
    enabled: !!labId,
    ...shared,
    queryFn: async () => {
      const [arrived, edited, answered] = await Promise.all([
        orderCount().eq('lab_id', labId!).eq('status', 'SUBMITTED'),
        orderCount().eq('lab_id', labId!).eq('has_unreviewed_edits', true),
        answeredClarificationCount({ column: 'lab_id', value: labId! }),
      ]);
      return {
        orders: arrived.count ?? 0,
        editedOrders: edited.count ?? 0,
        answeredClarifications: answered,
      };
    },
  });
  return data ?? { orders: 0, editedOrders: 0, answeredClarifications: 0 };
}

/** Doctor: their own orders that are waiting on them. */
export function useDoctorNavAlerts(doctorId: string | undefined) {
  const { data } = useQuery({
    queryKey: ['nav-alerts', 'doctor', doctorId],
    enabled: !!doctorId,
    ...shared,
    queryFn: async () => {
      const [waiting, answered] = await Promise.all([
        orderCount().eq('doctor_id', doctorId!).in('status', AWAITING_DOCTOR),
        answeredClarificationCount({ column: 'doctor_id', value: doctorId! }),
      ]);
      // An order the doctor has already answered still sits in
      // NEEDS_CLARIFICATION until the lab moves it — don't keep nagging about
      // work that is no longer theirs.
      return { orders: Math.max(0, (waiting.count ?? 0) - answered) };
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
      const [waiting, answered] = await Promise.all([
        orderCount().in('status', AWAITING_DOCTOR),
        answeredClarificationCount(null),
      ]);
      return { orders: Math.max(0, (waiting.count ?? 0) - answered) };
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
