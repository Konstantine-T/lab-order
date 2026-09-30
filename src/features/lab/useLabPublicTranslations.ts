import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * One lab's `public_translations` (0037), for a surface that only has the
 * lab's base name in hand — the order wizard's header. Runs under the same
 * marketplace read policy as the catalogue, so it works for guests too.
 *
 * Undefined while loading or on failure; `labText` then falls back to the
 * base name, which is what the header showed before.
 */
export function useLabPublicTranslations(labId: string | null | undefined): unknown {
  const { data } = useQuery({
    queryKey: ['lab-public-translations', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labs')
        .select('public_translations')
        .eq('id', labId!)
        .maybeSingle();
      if (error) throw error;
      return (data as { public_translations?: unknown } | null)?.public_translations ?? null;
    },
  });
  return data;
}
