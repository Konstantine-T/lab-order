import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { StartingPrice } from '@/utils/pricing';
import {
  SERVICE_PRICE_EMBED,
  servicePrice,
  type ServicePriceEmbed,
} from '@/features/catalog/servicePrice';

/** A lab as the landing page's catalogue teaser shows it. */
export type LandingLab = {
  id: string;
  public_name: string;
  city: string | null;
  logo_url: string | null;
  /** Active services. */
  serviceCount: number;
  /** From active services' `average_turnaround_days` (> 0); null when none says. */
  turnaround: { min: number; max: number } | null;
  /** Up to three active services that publish a number, in the lab's own order. */
  services: { id: string; name: string; from: StartingPrice }[];
};

/** How many priced services a landing card lists. */
const SERVICES_PER_CARD = 3;

/**
 * One round trip: labs → their services → each service's linked form → that
 * form's template code and published version's pricing (see
 * `SERVICE_PRICE_EMBED`), so this works for a signed-out visitor exactly as
 * the guest catalogue does.
 */
const SELECT = `
  id, public_name, city, logo_url,
  lab_services (
    id, name, is_active, sort_order, created_at, average_turnaround_days,
    ${SERVICE_PRICE_EMBED}
  )
`;

type ServiceRow = ServicePriceEmbed & {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number | null;
  created_at: string | null;
  average_turnaround_days: number | null;
};

type LabQueryRow = {
  id: string;
  public_name: string;
  city: string | null;
  logo_url: string | null;
  lab_services: ServiceRow[] | null;
};

// The order the lab's public profile lists its services in (sort_order, then
// age), with the name as a last tie-break so the pick never flickers.
const byListOrder = (a: ServiceRow, b: ServiceRow) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
  (a.created_at ?? '').localeCompare(b.created_at ?? '') ||
  a.name.localeCompare(b.name);

function toLandingLab(row: LabQueryRow): { lab: LandingLab; pricedCount: number } {
  // RLS already hides inactive services from `anon`; filtered again because a
  // signed-in lab owner's own policy would let theirs through.
  const active = (row.lab_services ?? []).filter((s) => s.is_active).sort(byListOrder);

  const days = active
    .map((s) => s.average_turnaround_days)
    .filter((d): d is number => typeof d === 'number' && d > 0);

  // Only a service a doctor can order right now advertises a price.
  const priced = active.flatMap((s) => {
    const from = servicePrice(s);
    return from ? [{ id: s.id, name: s.name.trim(), from }] : [];
  });

  return {
    lab: {
      id: row.id,
      public_name: row.public_name.trim(),
      city: row.city?.trim() || null,
      logo_url: row.logo_url,
      serviceCount: active.length,
      turnaround: days.length ? { min: Math.min(...days), max: Math.max(...days) } : null,
      services: priced.slice(0, SERVICES_PER_CARD),
    },
    pricedCount: priced.length,
  };
}

/**
 * The labs the landing page shows off: approved, live labs, the ones that
 * publish the most prices first — the section's promise is "prices and
 * turnaround", so a lab that shows none is the weakest example of it — then
 * by name. Sorting needs every lab's services, so the limit is applied here
 * rather than in the query.
 */
export function useLandingLabs(limit = 2): {
  labs: LandingLab[];
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['landing-labs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labs')
        .select(SELECT)
        .eq('approval_status', 'APPROVED_ACTIVE')
        .eq('is_active', true);
      if (error) throw error;

      return ((data ?? []) as unknown as LabQueryRow[])
        .map(toLandingLab)
        .sort(
          (a, b) =>
            b.pricedCount - a.pricedCount || a.lab.public_name.localeCompare(b.lab.public_name),
        )
        .slice(0, limit)
        .map((x) => x.lab);
    },
  });

  return { labs: data ?? [], isLoading, isError };
}
