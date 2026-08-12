import type { PricingConfig, RushType } from '@/types/database';
import { isModelTemplateCode } from '@/features/orderForms/modelTypes';

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
    if (pricing.model_per_jaw_price !== undefined) {
      // Model printing: price per jaw. Arch drives quantity — UPPER/LOWER = 1
      // arch, BOTH = 2. Detected by the per-jaw field (calculatePrice stays
      // template-code-free), like the other duck-typed branches below.
      const arch = (answers as { arch?: string }).arch;
      const qty = arch === 'BOTH' ? 2 : arch === 'UPPER' || arch === 'LOWER' ? 1 : 0;
      const unit = pricing.model_per_jaw_price ?? 0;
      subtotal = unit * qty;
      if (unit > 0 && qty > 0) {
        lineItems.push({
          i18nKey: 'modelPerJaw',
          label: 'Model (per jaw)',
          qty,
          unitAmount: unit,
          amount: unit * qty,
        });
      }
    } else if (Array.isArray(toothAssignments) && Array.isArray(pricing.materials)) {
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

/** Templates priced by a list of lab-defined materials (name + unit price). */
const MATERIAL_TEMPLATES = new Set([
  'CROWN_AND_BRIDGE',
  'TEMPORARY_CROWN',
  'TITANIUM_MILLING', // now mirrors C&B (per-tooth-material), not Model
  'EVIDENT_SMILE',
  'PRINT',
  'MILLING',
]);

/** A concrete reason pricing isn't publishable yet — carries enough context
 *  (row index, material name) for the UI to point at the exact field. */
export type PricingIssue =
  | { kind: 'no-materials' }
  | { kind: 'material-name'; index: number } // blank name
  | { kind: 'material-price'; index: number; name: string } // named, but no/zero price
  | { kind: 'fixed-price' }
  | { kind: 'unit-price' }
  | { kind: 'model-price' }
  | { kind: 'sg-price' }
  | { kind: 'rush-value' }
  | { kind: 'rush-turnaround' };

/**
 * The concrete reasons a pricing config isn't publishable yet. This is the
 * single source of truth: `isPricingComplete` is just "no issues", so the
 * publish gate and the messages we show the lab can never drift apart.
 *
 * Rules mirror the previous `isPricingComplete` exactly — this is a naming
 * layer, not a change to what is or isn't publishable. Empty ⇔ complete.
 */
export function pricingIssues(
  pricing: PricingConfig | undefined,
  templateCode: string | undefined,
): PricingIssue[] {
  // No pricing object yet — surface one representative reason so callers always
  // have something to show. (Safety net; the editors seed a pricing object.)
  if (!pricing) return [{ kind: 'no-materials' }];

  const issues: PricingIssue[] = [];

  // Rush, when enabled, needs both a surcharge value and a faster turnaround.
  const rush = pricing.rush;
  if (rush && rush.type !== 'NONE') {
    if (!rush.value || rush.value <= 0) issues.push({ kind: 'rush-value' });
    if (!rush.turnaround_days || rush.turnaround_days <= 0) {
      issues.push({ kind: 'rush-turnaround' });
    }
  }

  if (pricing.model === 'FIXED_PRICE') {
    if ((pricing.fixed_price ?? 0) <= 0) issues.push({ kind: 'fixed-price' });
  } else if (pricing.model === 'UNIT_BASED') {
    if (isModelTemplateCode(templateCode)) {
      // Model printing is complete once the per-jaw price is set (> 0).
      if ((pricing.model_per_jaw_price ?? 0) <= 0) issues.push({ kind: 'model-price' });
    } else if (templateCode && MATERIAL_TEMPLATES.has(templateCode)) {
      const ms = pricing.materials ?? [];
      if (ms.length === 0) {
        issues.push({ kind: 'no-materials' });
      } else {
        // A fully-empty row still counts as incomplete (unchanged behavior) —
        // we just name the problem: blank name → name issue, else missing price.
        ms.forEach((m, index) => {
          if (m.name.trim().length === 0) {
            issues.push({ kind: 'material-name', index });
          } else if ((m.unit_price ?? 0) <= 0) {
            issues.push({ kind: 'material-price', index, name: m.name.trim() });
          }
        });
      }
    } else if (templateCode === 'SURGICAL_GUIDE') {
      if (
        !(
          (pricing.sg_pilot_unit_price ?? 0) > 0 ||
          (pricing.sg_full_protocol_unit_price ?? 0) > 0
        )
      ) {
        issues.push({ kind: 'sg-price' });
      }
    } else if (templateCode === 'CONSTRUCTIONS_ON_IMPLANTS') {
      // Always publishable — prices default to zero and that's valid here.
    } else {
      if ((pricing.unit_price ?? 0) <= 0) issues.push({ kind: 'unit-price' });
    }
  } else {
    // Unknown model — never publishable (mirrors the old `return false`).
    issues.push({ kind: 'fixed-price' });
  }

  return issues;
}

/**
 * Pricing config is "complete enough to publish" when there are no issues.
 * Kept in lockstep with `pricingIssues` on purpose (one source of truth) so the
 * disabled Publish button and the specific "why" messages can never disagree.
 */
export function isPricingComplete(
  pricing: PricingConfig | undefined,
  templateCode: string | undefined,
): boolean {
  return pricingIssues(pricing, templateCode).length === 0;
}

export function formatGEL(amount: number): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'GEL',
    maximumFractionDigits: 2,
  }).format(amount);
}
