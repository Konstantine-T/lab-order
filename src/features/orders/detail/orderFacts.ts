import {
  coerceCnbAnswers,
  isCnbTemplate,
  materialColor,
  TEMPLATE_CODE_FINAL_CONSTRUCTION,
  type ShadeScale,
} from '@/features/orderForms/cnbTypes';
import { coerceFcDesign, isFcDesignEnabled } from '@/features/orderForms/fcTypes';
import { coerceEspAnswers, TEMPLATE_CODE_ESP } from '@/features/orderForms/espTypes';
import { coerceGrgAnswers, TEMPLATE_CODE_GRG } from '@/features/orderForms/grgTypes';
import {
  coerceMillingAnswers,
  coercePrintAnswers,
  TEMPLATE_CODE_MILLING,
  TEMPLATE_CODE_PRINT,
} from '@/features/orderForms/fabTypes';
import { coerceModelAnswers, isModelTemplateCode } from '@/features/orderForms/modelTypes';
import { coerceImplantAnswers, isImplantTemplate } from '@/features/orderForms/implantTypes';
import { coerceSgAnswers, TEMPLATE_CODE_SG } from '@/features/orderForms/sgTypes';
import type { FormConfiguration, MaterialOption, PricingConfig } from '@/types/database';

/** One legend line under the chart: a material, its colour and its teeth. */
export type ToothGroup = { label: string; color: string; teeth: number[] };

/**
 * The handful of answers the detail screen lifts out of the form to show at a
 * glance: which teeth, in what, in which shade. Everything else stays in the
 * full read-only form, which remains the complete record.
 */
export type OrderFacts = {
  /** Universal numbering, ascending — which reads 16 · 15 · 14 in FDI. */
  teeth: number[];
  /** Per-tooth material colour, the same palette the form paints with. */
  toothColors: Record<number, string>;
  notation: 'Universal' | 'FDI';
  groups: ToothGroup[];
  materials: string[];
  shade: { value: string; scale: ShadeScale | null; notes: string } | null;
  /** An explicit unit count, for the one template that asks for one. */
  units: number | null;
  notes: string[];
};

const EMPTY: OrderFacts = {
  teeth: [],
  toothColors: {},
  notation: 'FDI',
  groups: [],
  materials: [],
  shade: null,
  units: null,
  notes: [],
};

const validTeeth = (list: unknown[]): number[] =>
  [
    ...new Set(
      list.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 32),
    ),
  ].sort((a, b) => a - b);

const filled = (...values: string[]) => values.map((v) => v.trim()).filter(Boolean);

/**
 * Teeth painted per material — CnB and ESP share the shape. Colours follow the
 * lab's material order exactly as `TreatmentBuilder` assigns them, so the chart
 * here and the chart in the full form never disagree about which is which.
 */
function fromAssignments(
  assignments: { tooth: number; materialId: string }[],
  materials: MaterialOption[],
): Pick<OrderFacts, 'teeth' | 'toothColors' | 'groups' | 'materials'> {
  const teeth = validTeeth(assignments.map((a) => a.tooth));
  const toothColors: Record<number, string> = {};
  const groups: ToothGroup[] = [];
  materials.forEach((m, i) => {
    const own = validTeeth(assignments.filter((a) => a.materialId === m.id).map((a) => a.tooth));
    if (own.length === 0) return;
    const color = materialColor(i);
    for (const n of own) toothColors[n] = color;
    groups.push({ label: m.name, color, teeth: own });
  });
  return { teeth, toothColors, groups, materials: groups.map((g) => g.label) };
}

const materialName = (materials: MaterialOption[] | undefined, id: string) =>
  materials?.find((m) => m.id === id)?.name ?? null;

/**
 * Reads the at-a-glance facts through each template's own `coerce*` — the same
 * defensive hydration the form renders from — so nothing here can interpret a
 * stored answer differently from the form below it. A template with nothing
 * to lift simply contributes nothing.
 */
export function orderFacts(
  configuration: FormConfiguration | undefined,
  pricing: PricingConfig | undefined,
  values: Record<string, unknown>,
): OrderFacts {
  if (!configuration) return EMPTY;
  const code = configuration._templateCode;
  const materials = pricing?.materials ?? [];

  if (isCnbTemplate(code)) {
    const a = coerceCnbAnswers(values, pricing?.materials);
    // Final Construction is this form plus a design section, whose note is the
    // point of the order — the design wanted this time. Only while the form
    // shows the section, as the form itself decides.
    const designNotes =
      code === TEMPLATE_CODE_FINAL_CONSTRUCTION && isFcDesignEnabled(configuration)
        ? coerceFcDesign(values).fcDesignNotes
        : '';
    return {
      ...EMPTY,
      ...fromAssignments(a.toothAssignments, materials),
      notation: a.notation,
      shade: a.shade ? { value: a.shade, scale: a.shadeScale, notes: a.shadeNotes.trim() } : null,
      notes: filled(a.notes, designNotes, a.rxNotes),
    };
  }

  if (code === TEMPLATE_CODE_ESP) {
    const a = coerceEspAnswers(values);
    return {
      ...EMPTY,
      ...fromAssignments(a.toothAssignments, materials),
      notation: a.notation,
      shade: a.shade ? { value: a.shade, scale: a.shadeScale, notes: a.shadeNotes.trim() } : null,
      notes: filled(a.treatmentNotes, a.notes),
    };
  }

  if (code === TEMPLATE_CODE_GRG) {
    const a = coerceGrgAnswers(values);
    return { ...EMPTY, teeth: validTeeth(a.teeth), notes: filled(a.notes) };
  }

  if (code === TEMPLATE_CODE_MILLING) {
    const a = coerceMillingAnswers(values);
    const name = materialName(pricing?.materials, a.materialId);
    return {
      ...EMPTY,
      teeth: validTeeth(a.teeth),
      materials: name ? [name] : [],
      notes: filled(a.notes),
    };
  }

  if (code === TEMPLATE_CODE_PRINT) {
    const a = coercePrintAnswers(values);
    const name = materialName(pricing?.materials, a.materialId);
    return { ...EMPTY, materials: name ? [name] : [], units: a.units, notes: filled(a.notes) };
  }

  // Constructions on Implants and lab-placed abutments: the same positions,
  // read the same way (the abutments' own coerce only drops the crown). The
  // bar, on either, stays in the full form below, as it always has.
  if (isImplantTemplate(code)) {
    const a = coerceImplantAnswers(values);
    return { ...EMPTY, teeth: validTeeth(a.implantPositions), notation: a.notation };
  }

  if (code === TEMPLATE_CODE_SG) {
    const a = coerceSgAnswers(values);
    // Only the jaws the doctor chose: the other jaw's positions can survive in
    // the payload from before the choice changed, and the form hides them too.
    const upper = a.jaw === 'UPPER' || a.jaw === 'BOTH' ? a.upper.implantPositions : [];
    const lower = a.jaw === 'LOWER' || a.jaw === 'BOTH' ? a.lower.implantPositions : [];
    return { ...EMPTY, teeth: validTeeth([...upper, ...lower]) };
  }

  if (isModelTemplateCode(code)) {
    return { ...EMPTY, notes: filled(coerceModelAnswers(values).notes) };
  }

  // A form built from plain fields: its tooth, shade and material pickers are
  // real `fields[]` entries, so they can be read by type.
  const fields = configuration.fields.filter((f) => f.enabled);
  const teeth = validTeeth(
    fields
      .filter((f) => f.type === 'tooth_selection')
      .flatMap((f) => (Array.isArray(values[f.code]) ? (values[f.code] as unknown[]) : [])),
  );
  const shadeField = fields.find(
    (f) => f.type === 'shade_picker' && typeof values[f.code] === 'string' && values[f.code],
  );
  const picked = fields
    .filter((f) => f.type === 'material_select')
    .map((f) => values[f.code])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return {
    ...EMPTY,
    teeth,
    // The plain shade picker is VITA classical only, and says so on screen.
    shade: shadeField
      ? { value: values[shadeField.code] as string, scale: 'CLASSICAL', notes: '' }
      : null,
    materials: picked,
  };
}
