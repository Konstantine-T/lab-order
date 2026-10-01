import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { SERVICE_PRICE_EMBED, type ServicePriceEmbed } from '@/features/catalog/servicePrice';
import { serviceCategory, type ServiceCategory } from '@/features/catalog/serviceCategory';
import type { LabRow } from '@/types/database';
import { priceDisplay, rushOffer, type PriceDisplay, type RushOffer } from './priceDisplay';

/**
 * Only columns `anon` may read (0039) — this page is the guest's too. Never
 * widen this to `*`: the bank and legal columns are hidden from guests by a
 * column grant, and asking for one fails the whole request.
 */
const LAB_COLUMNS =
  'id, public_name, city, short_description, logo_url, contact_phone, contact_email, ' +
  'working_address, public_translations, price_lists';

export type ProfileLab = Pick<
  LabRow,
  | 'id'
  | 'public_name'
  | 'city'
  | 'short_description'
  | 'logo_url'
  | 'contact_phone'
  | 'contact_email'
  | 'working_address'
  | 'public_translations'
  | 'price_lists'
>;

/** One row of the services table. */
export type ProfileService = {
  id: string;
  name: string;
  description: string | null;
  turnaroundDays: number | null;
  turnaroundLabel: string | null;
  templateCode: string | null;
  category: ServiceCategory;
  /** The linked form is published: the order button works. */
  orderable: boolean;
  price: PriceDisplay;
  rush: RushOffer | null;
};

type ServiceQueryRow = ServicePriceEmbed & {
  id: string;
  name: string;
  short_description: string | null;
  average_turnaround_days: number | null;
  average_turnaround_label: string | null;
};

function toProfileService(row: ServiceQueryRow): ProfileService {
  const orderable = row.form?.status === 'PUBLISHED';
  const pricing = row.form?.version?.pricing_configuration_json ?? null;
  const templateCode = row.form?.template?.code ?? null;
  return {
    id: row.id,
    name: row.name.trim(),
    description: row.short_description?.trim() || null,
    turnaroundDays:
      typeof row.average_turnaround_days === 'number' && row.average_turnaround_days > 0
        ? row.average_turnaround_days
        : null,
    turnaroundLabel: row.average_turnaround_label?.trim() || null,
    templateCode,
    category: serviceCategory(templateCode),
    orderable,
    price: priceDisplay(orderable, pricing, templateCode),
    // Only a service a doctor can order right now advertises its rush: the
    // published version is the one the order form will price from.
    rush: orderable ? rushOffer(pricing) : null,
  };
}

/** The approved, live lab — null when it isn't (or doesn't exist). */
export function useProfileLab(labId: string | undefined) {
  return useQuery({
    queryKey: ['public-lab', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labs')
        .select(LAB_COLUMNS)
        .eq('id', labId!)
        .eq('approval_status', 'APPROVED_ACTIVE')
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return (data as ProfileLab | null) ?? null;
    },
  });
}

/**
 * The lab's active services in its own order, each with its form's status,
 * template and published pricing — one round trip, every hop readable by
 * `anon` (see `SERVICE_PRICE_EMBED`).
 */
export function useProfileServices(labId: string | undefined) {
  return useQuery({
    queryKey: ['public-lab-services', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_services')
        .select(
          `id, name, short_description, average_turnaround_days, average_turnaround_label,
           ${SERVICE_PRICE_EMBED}`,
        )
        .eq('lab_id', labId!)
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return ((data ?? []) as unknown as ServiceQueryRow[]).map(toProfileService);
    },
  });
}
