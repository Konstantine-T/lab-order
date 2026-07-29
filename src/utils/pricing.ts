import type { PricingConfig, RushType } from '@/types/database';

export type PriceLineItem = {
  label: string;
  /** If set, translate as t(`priceBreakdown.items.${i18nKey}`); label is the fallback */
  i18nKey?: string;
  /** Multiplier count, e.g. "× 3 implants" */
  qty?: number;
  /** Per-unit amount — used alongside baseAmount for bar display */
  unitAmount?: number;
  /** Base fee for base_plus_per_implant items (bar materials) */
  baseAmount?: number;
  amount: number;
};

export type PriceResult = {
  kind: 'CALCULATED';
  subtotal: number;
  rushAmount: number;
  total: number;
  lineItems: PriceLineItem[];
};

/**
 * Compute the doctor-facing estimate. Mirrored on the server when the order
 * is submitted (the lab confirms a final_total later).
 */
export function calculatePrice(
  pricing: PricingConfig | undefined,
  answers: Record<string, unknown>,
  rushOverride?: { type: RushType; value: number },
): PriceResult {
  if (!pricing) return { kind: 'CALCULATED', subtotal: 0, rushAmount: 0, total: 0, lineItems: [] };

  let subtotal = 0;
  const lineItems: PriceLineItem[] = [];

  if (pricing.model === 'FIXED_PRICE') {
    subtotal = pricing.fixed_price ?? 0;
    // No line items for fixed price — nothing to break down.
  } else if (pricing.model === 'UNIT_BASED') {
    // Crown & Bridge: sum each tooth assignment's material price.
    const toothAssignments = (answers as { toothAssignments?: unknown }).toothAssignments;
    if (Array.isArray(toothAssignments) && Array.isArray(pricing.materials)) {
      const priceById = new Map<string, number>(
        pricing.materials.map((m) => [m.id, m.unit_price ?? 0]),
      );
      const nameById = new Map<string, string>(
        pricing.materials.map((m) => [m.id, m.name]),
      );
      // Aggregate by material id
      const matCount = new Map<string, number>();
      subtotal = toothAssignments.reduce((sum, a) => {
        const ao = a as { materialId?: unknown };
        const mid = typeof ao.materialId === 'string' ? ao.materialId : '';
        matCount.set(mid, (matCount.get(mid) ?? 0) + 1);
        return sum + (priceById.get(mid) ?? 0);
      }, 0);
      for (const [mid, qty] of matCount) {
        const unitAmount = priceById.get(mid) ?? 0;
        const amount = unitAmount * qty;
        if (amount > 0) {
          lineItems.push({ label: nameById.get(mid) ?? mid, qty, unitAmount, amount });
        }
      }
      // Evident Smile Package: add gingival reduction guide fee if opted in
      if (
        (answers as Record<string, unknown>).needsGingivalReductionGuide === 'YES' &&
        (pricing.esp_gingival_reduction_price ?? 0) > 0
      ) {
        const fee = pricing.esp_gingival_reduction_price!;
        subtotal += fee;
        lineItems.push({ i18nKey: 'gingivalReduction', label: 'Gingival reduction guide', amount: fee });
      }
    } else if (
      typeof (answers as { materialId?: unknown }).materialId === 'string' &&
      Array.isArray(pricing.materials)
    ) {
      // Print / Milling: one material × unit count (typed units for Print,
      // selected-teeth count for Milling).
      const a = answers as { materialId?: string; units?: unknown; teeth?: unknown };
      const mat = pricing.materials.find((m) => m.id === a.materialId);
      const unitPrice = mat?.unit_price ?? 0;
      const qty = Array.isArray(a.teeth)
        ? a.teeth.length
        : typeof a.units === 'number'
          ? a.units
          : 0;
      subtotal = unitPrice * qty;
      if (subtotal > 0 && mat) {
        lineItems.push({ label: mat.name, qty, unitAmount: unitPrice, amount: subtotal });
      }
    } else if (typeof (answers as Record<string, unknown>).guideProtocol === 'string') {
      // Surgical Guide: protocol unit price × implant count + support type fees.
      const sg = answers as {
        guideProtocol?: string;
        jaw?: string;
        upper?: { implantPositions?: number[]; guideSupport?: string };
        lower?: { implantPositions?: number[]; guideSupport?: string };
      };
      const hasUpper = sg.jaw === 'UPPER' || sg.jaw === 'BOTH';
      const hasLower = sg.jaw === 'LOWER' || sg.jaw === 'BOTH';
      const upperCount = hasUpper ? (sg.upper?.implantPositions?.length ?? 0) : 0;
      const lowerCount = hasLower ? (sg.lower?.implantPositions?.length ?? 0) : 0;
      const implantCount = upperCount + lowerCount;
      const isPilot = sg.guideProtocol === 'PILOT';
      const unitPrice = isPilot
        ? (pricing.sg_pilot_unit_price ?? 0)
        : (pricing.sg_full_protocol_unit_price ?? 0);
      subtotal = unitPrice * implantCount;
      if (unitPrice > 0 && implantCount > 0) {
        lineItems.push({
          i18nKey: isPilot ? 'sgPilot' : 'sgFull',
          label: isPilot ? 'Pilot protocol' : 'Full protocol',
          qty: implantCount,
          unitAmount: unitPrice,
          amount: unitPrice * implantCount,
        });
      }
      const supportFees = pricing.sg_support_fees ?? [];
      if (hasUpper && sg.upper?.guideSupport) {
        const fee = supportFees.find((sf) => sf.supportType === sg.upper?.guideSupport)?.extra_fee ?? 0;
        subtotal += fee;
        if (fee > 0) {
          lineItems.push({ i18nKey: 'sgSupport', label: sg.upper.guideSupport, amount: fee });
        }
      }
      if (hasLower && sg.lower?.guideSupport) {
        const fee = supportFees.find((sf) => sf.supportType === sg.lower?.guideSupport)?.extra_fee ?? 0;
        subtotal += fee;
        if (fee > 0) {
          lineItems.push({ i18nKey: 'sgSupport', label: sg.lower.guideSupport, amount: fee });
        }
      }
    } else if (pricing.implant_price_config !== undefined || pricing.implant_crown_materials !== undefined) {
      // Constructions on Implants
      const cfg = pricing.implant_price_config ?? {};
      const crownMats = pricing.implant_crown_materials ?? [];
      const crownMatById = new Map(crownMats.map((m) => [m.id, m.unit_price ?? 0]));
      const crownNameById = new Map(crownMats.map((m) => [m.id, m.name]));

      const a = answers as {
        implantPositions?: number[];
        configsByPosition?: Record<string, {
          abutmentStatus?: string;
          abutmentType?: string;
          indMaterial?: string;
          indShape?: string;
          indRetention?: string;
          muaHex?: string;
          muaUpperConn?: string;
          factoryRetention?: string;
        }>;
        bar?: { needsBar?: boolean; barMaterial?: string; barTeeth?: number[] };
        cnbAnswers?: { toothAssignments?: Array<{ materialId?: string }> };
      };

      // Aggregate component usage: key → { label, price, count }
      const componentCount = new Map<string, { label: string; price: number; count: number }>();

      for (const pos of a.implantPositions ?? []) {
        const implantCfg = a.configsByPosition?.[String(pos)];
        if (!implantCfg) continue;

        if (implantCfg.abutmentStatus !== 'existingAbutment') {
          const keys: string[] = [];
          if (implantCfg.abutmentType) keys.push(implantCfg.abutmentType);
          if (implantCfg.abutmentType === 'individual') {
            if (implantCfg.indMaterial) keys.push(implantCfg.indMaterial);
            if (implantCfg.indShape)    keys.push(implantCfg.indShape);
            if (implantCfg.indRetention) keys.push(implantCfg.indRetention);
          } else if (implantCfg.abutmentType === 'multiunit') {
            if (implantCfg.muaHex)      keys.push(implantCfg.muaHex);
            if (implantCfg.muaUpperConn) keys.push(implantCfg.muaUpperConn);
          } else if (implantCfg.abutmentType === 'factory') {
            if (implantCfg.factoryRetention) keys.push(implantCfg.factoryRetention);
          }
          for (const k of keys) {
            const item = cfg[k];
            if (item?.enabled) {
              subtotal += item.price;
              const existing = componentCount.get(k);
              if (existing) {
                existing.count++;
              } else {
                componentCount.set(k, { label: item.label, price: item.price, count: 1 });
              }
            }
          }
        }
      }

      for (const [, { label, price, count }] of componentCount) {
        if (price > 0) {
          lineItems.push({ label, qty: count, unitAmount: price, amount: price * count });
        }
      }

      // Crown pricing from embedded CNB form (per tooth assignment)
      const crownCount = new Map<string, number>();
      for (const ta of a.cnbAnswers?.toothAssignments ?? []) {
        if (ta.materialId) {
          subtotal += crownMatById.get(ta.materialId) ?? 0;
          crownCount.set(ta.materialId, (crownCount.get(ta.materialId) ?? 0) + 1);
        }
      }
      for (const [mid, qty] of crownCount) {
        const unitAmount = crownMatById.get(mid) ?? 0;
        const amount = unitAmount * qty;
        if (amount > 0) {
          lineItems.push({ label: crownNameById.get(mid) ?? mid, qty, unitAmount, amount });
        }
      }

      // Bar pricing
      const bar = a.bar;
      if (bar?.needsBar) {
        const n = bar.barTeeth?.length ?? 0;
        if (bar.barMaterial) {
          const item = cfg[bar.barMaterial];
          if (item?.enabled) {
            if (item.pricingMode === 'base_plus_per_implant') {
              const base = item.basePrice ?? 0;
              const perUnit = item.perImplantPrice ?? 0;
              const amount = base + perUnit * n;
              subtotal += amount;
              if (amount > 0) {
                lineItems.push({
                  label: item.label,
                  qty: n,
                  unitAmount: perUnit,
                  baseAmount: base,
                  amount,
                });
              }
            } else {
              subtotal += item.price;
              if (item.price > 0) {
                lineItems.push({ label: item.label, amount: item.price });
              }
            }
          }
        }
      }
    } else {
      // Generic non-CnB: count `teeth` field × global unit_price.
      const teeth = answers['teeth'];
      const count = Array.isArray(teeth) ? teeth.length : 0;
      const unitPrice = pricing.unit_price ?? 0;
      subtotal = unitPrice * count;
      if (subtotal > 0) {
        lineItems.push({
          i18nKey: 'unitPrice',
          label: 'Unit price',
          qty: count,
          unitAmount: unitPrice,
          amount: subtotal,
        });
      }
    }
  }

  const rush = rushOverride ?? pricing.rush ?? { type: 'NONE', value: 0 };
  const rushValue = rush.value ?? 0;
  let rushAmount = 0;
  if (rush.type === 'PERCENTAGE') {
    rushAmount = (subtotal * rushValue) / 100;
  } else if (rush.type === 'FIXED_AMOUNT') {
    rushAmount = rushValue;
  }

  return {
    kind: 'CALCULATED',
    subtotal,
    rushAmount,
    total: subtotal + rushAmount,
    lineItems,
  };
}

/**
 * Pricing config is "complete enough to publish" when:
 *  - FIXED_PRICE → fixed_price > 0
 *  - UNIT_BASED + CnB → materials.length >= 1, every material has a name and price > 0
 *  - UNIT_BASED non-CnB → unit_price > 0
 */
export function isPricingComplete(
  pricing: PricingConfig | undefined,
  templateCode: string | undefined,
): boolean {
  if (!pricing) return false;
  // Rush, when enabled, must have both a surcharge value and a faster
  // turnaround configured before publish.
  const rush = pricing.rush;
  if (rush && rush.type !== 'NONE') {
    if (!rush.value || rush.value <= 0) return false;
    if (!rush.turnaround_days || rush.turnaround_days <= 0) return false;
  }

  if (pricing.model === 'FIXED_PRICE') {
    return (pricing.fixed_price ?? 0) > 0;
  }
  if (pricing.model === 'UNIT_BASED') {
    if (
      templateCode === 'CROWN_AND_BRIDGE' ||
      templateCode === 'TEMPORARY_CROWN' ||
      templateCode === 'EVIDENT_SMILE' ||
      templateCode === 'PRINT' ||
      templateCode === 'MILLING'
    ) {
      const ms = pricing.materials ?? [];
      if (ms.length === 0) return false;
      return ms.every((m) => m.name.trim().length > 0 && (m.unit_price ?? 0) > 0);
    }
    if (templateCode === 'SURGICAL_GUIDE') {
      return (
        (pricing.sg_pilot_unit_price ?? 0) > 0 ||
        (pricing.sg_full_protocol_unit_price ?? 0) > 0
      );
    }
    if (templateCode === 'CONSTRUCTIONS_ON_IMPLANTS') {
      return true; // prices default to zero and that's valid for this template
    }
    return (pricing.unit_price ?? 0) > 0;
  }
  return false;
}

export function formatGEL(amount: number): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'GEL',
    maximumFractionDigits: 2,
  }).format(amount);
}
