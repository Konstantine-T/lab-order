import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import type { ClinicForOrder } from './clinicOrder';

/** A clinic the signed-in doctor belongs to, with what an order for it shows. */
export type MyClinic = ClinicForOrder & { joinedAt: string };

/** Prefix for liveQueries and the invite card: membership changes on an accepted invite. */
export const MY_CLINIC_KEY = ['my-clinic'] as const;

type MyClinicRpcRow = {
  clinic_id: string;
  clinic_name: string;
  city: string | null;
  working_address: string | null;
  legal_name: string;
  identification_code: string | null;
  joined_at: string;
};

/** "Clinic: A" / "Clinics: A, B", or null with none. `tc` is `common`'s. */
export function myClinicsLabel(clinics: MyClinic[] | undefined, tc: TFunction): string | null {
  if (!clinics?.length) return null;
  return clinics.length === 1
    ? tc('clinicLabel', { clinic: clinics[0].name })
    : tc('clinicsLabel', { clinics: clinics.map((c) => c.name).join(', ') });
}

/**
 * The clinics the signed-in doctor belongs to (0050's `my_clinic()`), oldest
 * membership first; empty when none. A doctor cannot read `clinics` itself,
 * hence the RPC. Undefined while loading or when the call fails: callers then
 * show nothing rather than claim "no clinic".
 */
export function useMyClinics() {
  const { user } = useAuth();
  const isDoctor = user?.role === 'DOCTOR';
  return useQuery({
    queryKey: [...MY_CLINIC_KEY, user?.id],
    enabled: isDoctor,
    queryFn: async (): Promise<MyClinic[]> => {
      const { data, error } = await supabase.rpc('my_clinic');
      if (error) throw error;
      return ((data ?? []) as MyClinicRpcRow[]).map((r) => ({
        id: r.clinic_id,
        name: r.clinic_name,
        city: r.city?.trim() || null,
        workingAddress: r.working_address?.trim() || null,
        legalName: r.legal_name,
        identificationCode: r.identification_code,
        joinedAt: r.joined_at,
      }));
    },
  });
}
