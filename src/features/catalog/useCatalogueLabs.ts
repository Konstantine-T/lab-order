import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { CATALOGUE_SELECT, toCatalogueLab, type CatalogueLabRow } from './catalogue';

/**
 * Approved, live labs with their active services, priced and categorised —
 * one round trip, no session needed (every hop admits `anon`).
 *
 * The key stays `['marketplace-labs']`: the lab's own profile and price-list
 * screens invalidate it after an edit, so the catalogue refreshes.
 */
export function useCatalogueLabs() {
  return useQuery({
    queryKey: ['marketplace-labs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labs')
        .select(CATALOGUE_SELECT)
        .eq('approval_status', 'APPROVED_ACTIVE')
        .eq('is_active', true)
        .order('public_name');
      if (error) throw error;
      return ((data ?? []) as unknown as CatalogueLabRow[]).map(toCatalogueLab);
    },
  });
}
