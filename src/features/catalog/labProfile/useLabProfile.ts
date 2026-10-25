import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { SERVICE_PRICE_EMBED, type ServicePriceEmbed } from '@/features/catalog/servicePrice';
import { serviceCategory, type ServiceCategory } from '@/features/catalog/serviceCategory';
import { pickText } from '@/features/lab/labText';
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

/**
 * One service card. `name` / `description` / `turnaroundLabel`
 * are the base text here; `localizeProfileServices` swaps in the reader's
 * language (0042) before the page renders them.
 */
export type ProfileService = {
  id: string;
  name: string;
  description: string | null;
  turnaroundDays: number | null;
  turnaroundLabel: string | null;
  /** `lab_services.translations` (0042). */
  translations: unknown;
  templateCode: string | null;
  /** The lab's uploaded cover (`lab_services.cover_image_url`); the card falls
   *  back to the template's stock picture, then its icon. */
  imageUrl: string | null;
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
  cover_image_url: string | null;
  translations?: unknown;
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
    translations: row.translations ?? null,
    templateCode,
    imageUrl: row.cover_image_url?.trim() || null,
    category: serviceCategory(templateCode),
    orderable,
    price: priceDisplay(orderable, pricing, templateCode),
    // Only a service a doctor can order right now advertises its rush: the
    // published version is the one the order form will price from.
    rush: orderable ? rushOffer(pricing) : null,
  };
}

/**
 * The services with their text in `lang`: the lab's translation where it wrote
 * one, else the base (`pickText`'s rule), so nothing ever renders blank.
 */
export function localizeProfileServices(
  services: ProfileService[],
  lang: string,
): ProfileService[] {
  return services.map((s) => ({
    ...s,
    name: pickText(s.name, s.translations, 'name', lang),
    description: pickText(s.description, s.translations, 'short_description', lang) || null,
    turnaroundLabel:
      pickText(s.turnaroundLabel, s.translations, 'average_turnaround_label', lang) || null,
    // A described price is the lab's prose too (the version's pricing JSON).
    price:
      s.price.kind === 'described'
        ? {
            ...s.price,
            text: pickText(s.price.text, s.price.translations, 'price_description', lang).trim(),
          }
        : s.price,
  }));
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
           cover_image_url, translations, ${SERVICE_PRICE_EMBED}`,
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
