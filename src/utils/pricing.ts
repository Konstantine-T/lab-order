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
    if (templateCode === 'CROWN_AND_BRIDGE') {
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
