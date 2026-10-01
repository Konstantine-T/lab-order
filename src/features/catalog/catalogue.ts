import type { MaterialOption, PricingConfig } from '@/types/database';
import { labNames } from '@/features/lab/labText';
import { TEMPLATE_CODE_PRINT } from '@/features/orderForms/fabTypes';
import {
  SERVICE_PRICE_EMBED,
  priceIsExact,
  servicePrice,
  type ServicePriceEmbed,
} from './servicePrice';
import { serviceOrderHref } from './labProfile/orderLink';
import { CATEGORY_ORDER, serviceCategory, type ServiceCategory } from './serviceCategory';
import type { StartingPrice } from '@/utils/pricing';

/*
 * The catalogue's model: one round trip of labs and their services, reshaped
 * into what the filters and the lab card read, plus the pure filter, count
 * and ranking rules. Nothing here touches React, so the rules can be read —
 * and checked — without the page around them.
 */

/**
 * The marketplace query. Guest-reachable, so the `labs` columns are exactly
 * the ones 0039 grants `anon` (never `*`); the service hop and everything
 * under it (`SERVICE_PRICE_EMBED`) are anon-readable as well.
 */
export const CATALOGUE_SELECT = `
  id, public_name, city, working_address, short_description, logo_url, created_at,
  public_translations, price_lists,
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

/** One row of `CATALOGUE_SELECT`. */
export type CatalogueLabRow = {
  id: string;
  public_name: string;
  city: string | null;
  working_address: string | null;
  short_description: string | null;
  logo_url: string | null;
  created_at: string | null;
  public_translations: unknown;
  price_lists: unknown;
  lab_services: ServiceRow[] | null;
};

/** A service's rush option, when the lab has switched it on AND named its speed. */
export type CatalogueRush = {
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  /** The surcharge; null when the lab left it blank (the days still stand). */
  value: number | null;
  days: number;
};

export type CatalogueService = {
  id: string;
  name: string;
  category: ServiceCategory;
  /** Its form is published: the doctor can order it right now. */
  orderable: boolean;
  /** `average_turnaround_days` when the lab set a positive one. */
  turnaroundDays: number | null;
  /** The "from" price (see `servicePrice`); null when not orderable or unpriced. */
  from: StartingPrice | null;
  /** `from` is the price, not merely the lowest of several. */
  exact: boolean;
  rush: CatalogueRush | null;
  /** Material names as the lab spelled them (trimmed, single-spaced). */
  materialNames: string[];
  /** The same materials as `materialKey`s, for the filter. */
  materials: string[];
  /**
   * Each material's own price, by `materialKey` — set only when the service
   * is priced off that material list (see `materialPricesOf`); null when its
   * price does not depend on the material.
   */
  materialPrices: Record<string, MaterialPrice> | null;
};

/** What one material of a service costs. */
export type MaterialPrice = {
  amount: number;
  per: StartingPrice['per'];
  /** The amount is that material's one price, not merely its floor. */
  exact: boolean;
};

/** A lab as the catalogue shows and filters it. */
export type CatalogueLab = {
  id: string;
  public_name: string;
  city: string | null;
  working_address: string | null;
  short_description: string | null;
  logo_url: string | null;
  created_at: string | null;
  public_translations: unknown;
  price_lists: unknown;
  /** Active services, in the order the lab's profile lists them. */
  services: CatalogueService[];
  /** Services that publish a number — the ranking key. */
  pricedCount: number;
  /** Across orderable services with a positive turnaround; null when none says. */
  turnaround: { min: number; max: number } | null;
};

/* ---------------------------------------------------------------------------
 * Row → model
 * ------------------------------------------------------------------------- */

const positive = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/** Same rule as `RushChip`: on, and with a faster turnaround the lab can name. */
export function rushOf(pricing: PricingConfig | null | undefined): CatalogueRush | null {
  const rush = pricing?.rush;
  if (!rush || (rush.type !== 'PERCENTAGE' && rush.type !== 'FIXED_AMOUNT')) return null;
  const days = positive(rush.turnaround_days);
  if (days === null) return null;
  return { type: rush.type, value: positive(rush.value), days };
}

/**
 * Templates whose `materials` are restoration materials a doctor would
 * filter by: crown & bridge, the C&B-shaped final construction, printing and
 * milling. Evident Smile also prices by a `materials` list, but its entries
 * are wax-up kinds, not materials, so it stays out. Implant crowns come from
 * `implant_crown_materials`, whatever the template.
 */
const MATERIAL_FILTER_CODES = new Set([
  'CROWN_AND_BRIDGE',
  'TEMPORARY_CROWN',
  'ZIRCONIA_CROWN',
  'FINAL_CONSTRUCTION',
  'PRINT',
  'MILLING',
  'TITANIUM_MILLING',
]);

/** A material name as displayed: trimmed, runs of whitespace collapsed. */
const tidy = (name: string) => name.trim().replace(/\s+/g, ' ');

/**
 * The merge key for a material: case and whitespace ignored, so "Zirconia",
 * "zirconia " and "ცირკონო ფაიფური" / "ცირკონოფაიფური" land on one chip.
 */
export function materialKey(name: string): string {
  return name.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, '');
}

function materialNamesOf(
  pricing: PricingConfig | null | undefined,
  templateCode: string | null | undefined,
): string[] {
  if (!pricing) return [];
  const raw: unknown[] = [];
  if (templateCode && MATERIAL_FILTER_CODES.has(templateCode) && Array.isArray(pricing.materials)) {
    raw.push(...pricing.materials.map((m) => m?.name));
  }
  if (Array.isArray(pricing.implant_crown_materials)) {
    raw.push(...pricing.implant_crown_materials.map((m) => m?.name));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== 'string') continue;
    const name = tidy(r);
    const key = materialKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * The price of each material, by `materialKey`, when the service is priced
 * off a material list — the rule `startingPrice` reads, in its order: a
 * unit-based model, not model printing; then the `materials` list (of a
 * template the filter reads it for), else — no surgical-guide rates — the
 * implant crowns. Null for any other service: its price does not depend on
 * the material, so the material filter leaves it alone.
 *
 * A material is exact under the same rule as `priceIsExact`: a C&B-shaped
 * list prices one tooth at the material's price; a print unit is not a whole
 * order, and an implant crown is the floor under its abutment parts. Two
 * spellings of one material at different prices make it a floor too.
 */
function materialPricesOf(
  pricing: PricingConfig | null | undefined,
  templateCode: string | null | undefined,
): Record<string, MaterialPrice> | null {
  if (!pricing || pricing.model !== 'UNIT_BASED' || pricing.model_per_jaw_price !== undefined) {
    return null;
  }
  let list: MaterialOption[] | undefined;
  let per: StartingPrice['per'] = 'tooth';
  let floor = false;
  if (Array.isArray(pricing.materials)) {
    if (!templateCode || !MATERIAL_FILTER_CODES.has(templateCode)) return null;
    list = pricing.materials;
    if (templateCode === TEMPLATE_CODE_PRINT) {
      per = 'order';
      floor = true;
    }
  } else if (
    pricing.sg_pilot_unit_price !== undefined ||
    pricing.sg_full_protocol_unit_price !== undefined ||
    pricing.sg_support_fees !== undefined
  ) {
    return null;
  } else if (Array.isArray(pricing.implant_crown_materials)) {
    list = pricing.implant_crown_materials;
    floor = true;
  } else {
    return null;
  }

  const amounts = new Map<string, Set<number>>();
  for (const m of list) {
    const amount = positive(m?.unit_price);
    if (typeof m?.name !== 'string' || amount === null) continue;
    const key = materialKey(tidy(m.name));
    if (!key) continue;
    const set = amounts.get(key) ?? new Set<number>();
    amounts.set(key, set);
    set.add(amount);
  }
  const out: Record<string, MaterialPrice> = {};
  for (const [key, set] of amounts) {
    out[key] = { amount: Math.min(...set), per, exact: !floor && set.size === 1 };
  }
  return out;
}

// The order the lab's public profile lists its services in (sort_order, then
// age), with the name as a last tie-break so the order never flickers.
const byListOrder = (a: ServiceRow, b: ServiceRow) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
  (a.created_at ?? '').localeCompare(b.created_at ?? '') ||
  a.name.localeCompare(b.name);

function toService(row: ServiceRow): CatalogueService {
  const orderable = row.form?.status === 'PUBLISHED';
  const code = row.form?.template?.code ?? null;
  // Only what a doctor can order right now advertises a price, a rush or a
  // material — the same "published form" test as the profile's order button.
  const pricing = orderable ? row.form?.version?.pricing_configuration_json : null;
  const from = servicePrice(row);
  const materialNames = materialNamesOf(pricing, code);
  return {
    id: row.id,
    name: row.name.trim(),
    category: serviceCategory(code),
    orderable,
    turnaroundDays: positive(row.average_turnaround_days),
    from,
    exact: from !== null && priceIsExact(pricing, code),
    rush: rushOf(pricing),
    materialNames,
    materials: materialNames.map(materialKey),
    materialPrices: materialPricesOf(pricing, code),
  };
}

export function toCatalogueLab(row: CatalogueLabRow): CatalogueLab {
  // RLS already hides inactive services from `anon`; filtered again because a
  // signed-in lab owner's own policy would let theirs through.
  const services = (row.lab_services ?? [])
    .filter((s) => s.is_active)
    .sort(byListOrder)
    .map(toService);
  // Orderable services only — the set the turnaround filter reads, so the
  // card never shows a range the "≤ N days" filter would not honour.
  const days = services
    .filter((s) => s.orderable)
    .map((s) => s.turnaroundDays)
    .filter((d): d is number => d !== null);
  return {
    id: row.id,
    public_name: row.public_name.trim(),
    city: row.city?.trim() || null,
    working_address: row.working_address?.trim() || null,
    short_description: row.short_description,
    logo_url: row.logo_url,
    created_at: row.created_at,
    public_translations: row.public_translations ?? null,
    price_lists: row.price_lists ?? null,
    services,
    pricedCount: services.filter((s) => s.from !== null).length,
    turnaround: days.length ? { min: Math.min(...days), max: Math.max(...days) } : null,
  };
}

/* ---------------------------------------------------------------------------
 * Materials
 * ------------------------------------------------------------------------- */

export type MaterialChoice = {
  key: string;
  /** The prettiest spelling the labs use (see `pickLabel`). */
  label: string;
  /** Labs offering it. */
  labCount: number;
};

/**
 * Small, deterministic taste: an all-lowercase Latin spelling ("zirconia")
 * or a shouted long one ("ZIRCONIA") loses to a capitalised one; acronyms
 * such as PMMA or EMAX are left alone.
 */
function casePenalty(label: string): number {
  const latin = label.replace(/[^A-Za-z]/g, '');
  if (!latin) return 0;
  if (latin === latin.toLowerCase()) return 2;
  if (latin.length > 4 && latin === latin.toUpperCase()) return 1;
  return 0;
}

type Variant = { label: string; labs: Set<string>; services: number };

/**
 * The label a merged chip shows: the best-cased spelling, then the one most
 * labs use, then the one most services use, then the one with word breaks
 * ("PMMA დაჩარხული" over "PMMAდაჩარხული"), then alphabetical.
 */
function pickLabel(variants: Variant[]): string {
  const spaces = (s: string) => (s.match(/ /g) ?? []).length;
  return [...variants].sort(
    (a, b) =>
      casePenalty(a.label) - casePenalty(b.label) ||
      b.labs.size - a.labs.size ||
      b.services - a.services ||
      spaces(b.label) - spaces(a.label) ||
      a.label.localeCompare(b.label),
  )[0].label;
}

/** Every material the labs' published forms list, merged, most-offered first. */
export function buildMaterials(labs: CatalogueLab[]): MaterialChoice[] {
  const byKey = new Map<string, Map<string, Variant>>();
  const labsByKey = new Map<string, Set<string>>();
  for (const lab of labs) {
    for (const s of lab.services) {
      if (!s.orderable) continue;
      s.materialNames.forEach((label, i) => {
        const key = s.materials[i];
        const variants = byKey.get(key) ?? new Map<string, Variant>();
        byKey.set(key, variants);
        const v = variants.get(label) ?? { label, labs: new Set<string>(), services: 0 };
        variants.set(label, v);
        v.labs.add(lab.id);
        v.services += 1;
        const all = labsByKey.get(key) ?? new Set<string>();
        labsByKey.set(key, all);
        all.add(lab.id);
      });
    }
  }
  return [...byKey.entries()]
    .map(([key, variants]) => ({
      key,
      label: pickLabel([...variants.values()]),
      labCount: labsByKey.get(key)?.size ?? 0,
    }))
    .sort((a, b) => b.labCount - a.labCount || a.label.localeCompare(b.label));
}

/* ---------------------------------------------------------------------------
 * Filters
 * ------------------------------------------------------------------------- */

/** The turnaround choices, in days: "≤ 3", "≤ 5", "≤ 7" (plus "any"). */
export const TURNAROUND_BUCKETS = [3, 5, 7] as const;

export type CatalogueFilters = {
  search: string;
  /** Any of these service types (OR). */
  categories: ServiceCategory[];
  /** Any of these material keys (OR). */
  materials: string[];
  city: string | null;
  /** A service done in at most this many days. */
  maxDays: number | null;
  /** A service that offers rush. */
  rush: boolean;
};

export type FilterFacet = keyof CatalogueFilters;

export const EMPTY_FILTERS: CatalogueFilters = {
  search: '',
  categories: [],
  materials: [],
  city: null,
  maxDays: null,
  rush: false,
};

export function isCategory(v: string): v is ServiceCategory {
  return (CATEGORY_ORDER as readonly string[]).includes(v);
}

/** How many chips the active filters make — the "clear · N" count. */
export function activeFilterCount(f: CatalogueFilters): number {
  return (
    (f.search.trim() ? 1 : 0) +
    f.categories.length +
    f.materials.length +
    (f.city ? 1 : 0) +
    (f.maxDays ? 1 : 0) +
    (f.rush ? 1 : 0)
  );
}

/**
 * The service-level filters — type, material, turnaround, rush — must all
 * hold for ONE service: "crowns, ≤ 3 days, rush" finds a lab whose crown
 * service is that fast and offers rush, not a lab with slow crowns and a
 * fast model. Only orderable services count: they are what a doctor can act
 * on, and the only ones with a published price, rush or material list.
 * `skip` leaves one facet out, for that facet's own option counts.
 */
export function serviceMatches(
  s: CatalogueService,
  f: CatalogueFilters,
  skip?: FilterFacet,
): boolean {
  if (!s.orderable) return false;
  if (skip !== 'categories' && f.categories.length && !f.categories.includes(s.category)) {
    return false;
  }
  if (skip !== 'maxDays' && f.maxDays && !(s.turnaroundDays !== null && s.turnaroundDays <= f.maxDays)) {
    return false;
  }
  if (skip !== 'rush' && f.rush && !s.rush) return false;
  if (skip !== 'materials' && f.materials.length && !s.materials.some((m) => f.materials.includes(m))) {
    return false;
  }
  return true;
}

/** Whether any service-level filter is on (ignoring `skip`). */
export function hasServiceFilters(f: CatalogueFilters, skip?: FilterFacet): boolean {
  return (
    (skip !== 'categories' && f.categories.length > 0) ||
    (skip !== 'materials' && f.materials.length > 0) ||
    (skip !== 'maxDays' && !!f.maxDays) ||
    (skip !== 'rush' && f.rush)
  );
}

/** Every name the lab goes by, its city and address, and its services' names. */
export function searchMatches(lab: CatalogueLab, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return (
    labNames(lab).some((n) => n.toLocaleLowerCase().includes(q)) ||
    (lab.city ?? '').toLocaleLowerCase().includes(q) ||
    (lab.working_address ?? '').toLocaleLowerCase().includes(q) ||
    lab.services.some((s) => s.name.toLocaleLowerCase().includes(q))
  );
}

export function labMatches(lab: CatalogueLab, f: CatalogueFilters, skip?: FilterFacet): boolean {
  if (skip !== 'city' && f.city && lab.city !== f.city) return false;
  if (skip !== 'search' && !searchMatches(lab, f.search)) return false;
  if (!hasServiceFilters(f, skip)) return true;
  return lab.services.some((s) => serviceMatches(s, f, skip));
}

export type FacetCounts = {
  categories: { key: ServiceCategory; count: number }[];
  materials: (MaterialChoice & { count: number })[];
  cities: { name: string; count: number }[];
  /** Labs that would match with rush on. */
  rush: number;
  /** Whether any lab offers rush at all — the toggle hides otherwise. */
  rushOffered: boolean;
};

/**
 * Each option's count is the number of labs the results would show if it
 * were that facet's only pick, with every other facet as it stands — the
 * usual faceted-search reading, so a count never promises more than a click
 * delivers.
 */
export function facetCounts(
  labs: CatalogueLab[],
  materials: MaterialChoice[],
  f: CatalogueFilters,
): FacetCounts {
  // The patch replaces the facet's own selection with the one option.
  const count = (patch: Partial<CatalogueFilters>) =>
    labs.filter((l) => labMatches(l, { ...f, ...patch })).length;

  const present = new Set<ServiceCategory>();
  const cities = new Set<string>();
  let rushOffered = false;
  for (const lab of labs) {
    if (lab.city) cities.add(lab.city);
    for (const s of lab.services) {
      if (!s.orderable) continue;
      present.add(s.category);
      if (s.rush) rushOffered = true;
    }
  }

  return {
    categories: CATEGORY_ORDER.filter((c) => present.has(c)).map((key) => ({
      key,
      count: count({ categories: [key] }),
    })),
    materials: materials.map((m) => ({ ...m, count: count({ materials: [m.key] }) })),
    cities: [...cities]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, count: count({ city: name }) })),
    rush: count({ rush: true }),
    rushOffered,
  };
}

/* ---------------------------------------------------------------------------
 * Ranking, featured price, links
 * ------------------------------------------------------------------------- */

/**
 * Labs that publish the most prices first — the catalogue's promise is
 * "prices and turnaround", the same rule as the landing teaser — then by
 * the name the reader sees, in their language.
 */
export function rankLabs(
  labs: CatalogueLab[],
  nameOf: (lab: CatalogueLab) => string,
  lang: string,
): CatalogueLab[] {
  return [...labs].sort(
    (a, b) => b.pricedCount - a.pricedCount || nameOf(a).localeCompare(nameOf(b), lang),
  );
}

/** A price as the card shows it, and — when it is one material's — which. */
export type ShownPrice = StartingPrice & {
  exact: boolean;
  /** The material as this lab spells it; null for the service's own "from". */
  material: string | null;
};

/**
 * A service's price on the card. With a material filter on, a service priced
 * by material that lists a selected one shows that material's price — the
 * cheapest of the selected ones it lists — never another material's:
 * filtering by zirconia must not headline the metal-ceramic price. If none
 * of them is priced it shows no number. Any other service shows its "from".
 */
export function shownPrice(
  s: CatalogueService,
  materials: readonly string[] = [],
): ShownPrice | null {
  const selected = s.materialPrices ? materials.filter((m) => s.materials.includes(m)) : [];
  if (selected.length) {
    let best: ShownPrice | null = null;
    for (const key of selected) {
      const p = s.materialPrices?.[key];
      if (p && (!best || p.amount < best.amount)) {
        best = { ...p, material: s.materialNames[s.materials.indexOf(key)] ?? null };
      }
    }
    return best;
  }
  return s.from ? { ...s.from, exact: s.exact, material: null } : null;
}

export type FeaturedPrice = { service: CatalogueService; price: ShownPrice };

/**
 * The service whose price the card features: the cheapest crown & bridge
 * price per tooth if the lab publishes one, else its cheapest published
 * price of any kind. Ties keep the lab's own order. Null when nothing is
 * priced — the card then has no order button of its own.
 *
 * With service filters on, the same rule runs over the services that match
 * them first — filtering by implants should feature (and order) an implant
 * service, not the lab's crowns — falling back to the whole list when none of
 * the matching services is priced. Prices are `shownPrice`'s, so a material
 * filter features the selected material's price.
 */
export function featuredService(
  lab: CatalogueLab,
  matches?: (s: CatalogueService) => boolean,
  materials: readonly string[] = [],
): FeaturedPrice | null {
  const priced = (list: CatalogueService[]) =>
    list.flatMap((service) => {
      const price = shownPrice(service, materials);
      return price ? [{ service, price }] : [];
    });
  const cheapest = (list: FeaturedPrice[]) =>
    list.reduce<FeaturedPrice | null>(
      (best, x) => (!best || x.price.amount < best.price.amount ? x : best),
      null,
    );
  const pick = (list: CatalogueService[]) => {
    const all = priced(list);
    return (
      cheapest(all.filter((x) => x.service.category === 'crownBridge' && x.price.per === 'tooth')) ??
      cheapest(all)
    );
  };
  return (matches ? pick(lab.services.filter(matches)) : null) ?? pick(lab.services);
}

/**
 * The order form for one service — the lab profile's own link builder, with
 * the clinic's acting doctor carried along.
 */
export function orderHref(
  orderNew: string,
  labId: string,
  serviceId: string,
  doctor?: string | null,
): string {
  return serviceOrderHref(orderNew, labId, serviceId, { doctor });
}
