import type { PricingConfig, RushType } from '@/types/database';

export type PriceResult = {
  kind: 'CALCULATED';
  subtotal: number;
  rushAmount: number;
  total: number;
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
  if (!pricing) return { kind: 'CALCULATED', subtotal: 0, rushAmount: 0, total: 0 };

  let subtotal = 0;

  if (pricing.model === 'FIXED_PRICE') {
    subtotal = pricing.fixed_price ?? 0;
  } else if (pricing.model === 'UNIT_BASED') {
    // Crown & Bridge: sum each tooth assignment's material price.
    const toothAssignments = (answers as { toothAssignments?: unknown }).toothAssignments;
    if (Array.isArray(toothAssignments) && Array.isArray(pricing.materials)) {
      const priceById = new Map<string, number>(
        pricing.materials.map((m) => [m.id, m.unit_price ?? 0]),
      );
      subtotal = toothAssignments.reduce((sum, a) => {
        const ao = a as { materialId?: unknown };
        const mid = typeof ao.materialId === 'string' ? ao.materialId : '';
        return sum + (priceById.get(mid) ?? 0);
      }, 0);
      // Evident Smile Package: add gingival reduction guide fee if opted in
      if (
        (answers as Record<string, unknown>).needsGingivalReductionGuide === 'YES' &&
        (pricing.esp_gingival_reduction_price ?? 0) > 0
      ) {
        subtotal += pricing.esp_gingival_reduction_price!;
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
      const unitPrice =
        sg.guideProtocol === 'PILOT'
          ? (pricing.sg_pilot_unit_price ?? 0)
          : (pricing.sg_full_protocol_unit_price ?? 0);
      subtotal = unitPrice * implantCount;
      const supportFees = pricing.sg_support_fees ?? [];
      if (hasUpper && sg.upper?.guideSupport) {
        subtotal +=
          supportFees.find((sf) => sf.supportType === sg.upper?.guideSupport)?.extra_fee ?? 0;
      }
      if (hasLower && sg.lower?.guideSupport) {
        subtotal +=
          supportFees.find((sf) => sf.supportType === sg.lower?.guideSupport)?.extra_fee ?? 0;
      }
    } else if (pricing.implant_price_config !== undefined || pricing.implant_crown_materials !== undefined) {
      // Constructions on Implants
      const cfg = pricing.implant_price_config ?? {};
      const crownMats = pricing.implant_crown_materials ?? [];
      const crownMatById = new Map(crownMats.map((m) => [m.id, m.unit_price ?? 0]));

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

      for (const pos of a.implantPositions ?? []) {
        const implantCfg = a.configsByPosition?.[String(pos)];
        if (!implantCfg) continue;

        // existingAbutment: no component prices
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
            if (item?.enabled) subtotal += item.price;
          }
        }
      }

      // Crown pricing from embedded CNB form (per tooth assignment)
      for (const ta of a.cnbAnswers?.toothAssignments ?? []) {
        if (ta.materialId) subtotal += crownMatById.get(ta.materialId) ?? 0;
      }

      // Bar pricing
      const bar = a.bar;
      if (bar?.needsBar) {
        const n = bar.barTeeth?.length ?? 0;
        if (bar.barMaterial) {
          const item = cfg[bar.barMaterial];
          if (item?.enabled) {
            if (item.pricingMode === 'base_plus_per_implant') {
              subtotal += (item.basePrice ?? 0) + (item.perImplantPrice ?? 0) * n;
            } else {
              subtotal += item.price;
            }
          }
        }
      }
    } else {
      // Generic non-CnB: count `teeth` field × global unit_price.
      const teeth = answers['teeth'];
      const count = Array.isArray(teeth) ? teeth.length : 0;
      subtotal = (pricing.unit_price ?? 0) * count;
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
    if (templateCode === 'CROWN_AND_BRIDGE' || templateCode === 'EVIDENT_SMILE') {
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
