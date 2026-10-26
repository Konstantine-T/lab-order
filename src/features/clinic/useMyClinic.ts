import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';

export type MyClinic = { id: string; name: string; city: string | null };

/** Prefix for liveQueries and the invite card: membership changes on an accepted invite. */
export const MY_CLINIC_KEY = ['my-clinic'] as const;

/**
 * The clinic the signed-in doctor belongs to (0049's `my_clinic()`), or null
 * when they belong to none. A doctor cannot read `clinics` itself, hence the
 * RPC. Undefined while loading or when the call fails: callers then show
 * nothing rather than claim "no clinic".
 */
export function useMyClinic() {
  const { user } = useAuth();
  const isDoctor = user?.role === 'DOCTOR';
  return useQuery({
    queryKey: [...MY_CLINIC_KEY, user?.id],
    enabled: isDoctor,
    queryFn: async (): Promise<MyClinic | null> => {
      const { data, error } = await supabase.rpc('my_clinic');
      if (error) throw error;
      const row = ((data ?? []) as { clinic_id: string; clinic_name: string; city: string | null }[])[0];
      return row ? { id: row.clinic_id, name: row.clinic_name, city: row.city?.trim() || null } : null;
    },
  });
}
