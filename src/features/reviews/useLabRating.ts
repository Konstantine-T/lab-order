import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ratingOf, type LabRating } from './rating';

/**
 * A lab's public numbers (0044's `lab_rating_summary`, anon-readable), for the
 * profile header and the reviews card. Keyed under `['public-lab', labId]`,
 * so everything that refreshes the profile refreshes this too. A lab nobody
 * has reviewed has no row: zero reviews, no average. A failed read is the
 * same as none — the rating is decoration, never a reason for an error.
 */
export function useLabRating(labId: string | undefined) {
  return useQuery({
    queryKey: ['public-lab', labId, 'rating'],
    enabled: !!labId,
    queryFn: async (): Promise<LabRating> => {
      const { data, error } = await supabase
        .from('lab_rating_summary')
        .select('review_count, rating_avg')
        .eq('lab_id', labId!)
        .maybeSingle();
      if (error) return { count: 0, average: null };
      return ratingOf(data) ?? { count: 0, average: null };
    },
  });
}
