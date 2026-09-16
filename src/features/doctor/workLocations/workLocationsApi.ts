import { supabase } from '@/lib/supabase';
import type { WorkLocationInput } from './schema';

/**
 * Insert a work location for a doctor and return its id.
 *
 * One implementation for the two places a location is created — the work
 * locations page and the order wizard's inline dialog — so the "only one
 * default" rule cannot drift between them: asking for the default first
 * unsets every other live location's flag.
 */
export async function createWorkLocation(
  doctorId: string,
  values: WorkLocationInput,
): Promise<string> {
  if (values.is_default) {
    await supabase
      .from('doctor_work_locations')
      .update({ is_default: false })
      .eq('doctor_id', doctorId)
      .is('archived_at', null);
  }
  const { data, error } = await supabase
    .from('doctor_work_locations')
    .insert({
      doctor_id: doctorId,
      clinic_name: values.clinic_name,
      branch_name: values.branch_name || null,
      address: values.address,
      city: values.city,
      clinic_identification_code: values.clinic_identification_code || null,
      clinic_invoice_email: values.clinic_invoice_email || null,
      phone: values.phone || null,
      is_default: values.is_default,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}
