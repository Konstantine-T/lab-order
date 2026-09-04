import { isCnbTemplate } from '@/features/orderForms/cnbTypes';
import { TEMPLATE_CODE_SG } from '@/features/orderForms/sgTypes';
import { TEMPLATE_CODE_ESP } from '@/features/orderForms/espTypes';
import { TEMPLATE_CODE_GRG } from '@/features/orderForms/grgTypes';
import { isModelTemplateCode } from '@/features/orderForms/modelTypes';
import { TEMPLATE_CODE_IMPLANT } from '@/features/orderForms/implantTypes';
import { TEMPLATE_CODE_PRINT, TEMPLATE_CODE_MILLING } from '@/features/orderForms/fabTypes';
import { valuesEqual } from './diff';
import type { FormConfiguration } from '@/types/database';

/**
 * Which named section of a clinical form each stored answer belongs to.
 *
 * The lab used to be told only *that* an order was edited — a "changed × 2"
 * badge and two complete copies of the form, one above the other, to compare by
 * eye. Naming the section needs this table because a template's answers are
 * typed keys (`occlusalContact`, `upper.guideSupport`), not `fields[]` entries
 * with labels attached; nothing in the stored answers says which question a key
 * came from.
 *
 * `labelKey` is a `lab` namespace key that the form itself already renders as
 * that section's heading, so the summary and the form can't drift into
 * different wording — and there are no new strings to translate.
 *
 * A key may be nested one level (`upper.condition`); see `readPath`.
 */
type Section = {
  /** Answer keys, dotted for nested ones, that this section owns. */
  keys: string[];
  /** `lab` namespace key for the section heading. */
  labelKey: string;
  /** Set on the surgical guide's per-jaw sections, which appear twice. */
  jaw?: 'upper' | 'lower';
};

const CNB: Section[] = [
  { keys: ['toothAssignments', 'notation', 'notes'], labelKey: 'cnbForm.sections.treatments' },
  { keys: ['shade', 'shadeScale', 'shadeNotes'], labelKey: 'cnbForm.sections.shade' },
  { keys: ['gingivalContouring'], labelKey: 'cnbForm.sections.gingivalContouring' },
  { keys: ['verticalDimension'], labelKey: 'cnbForm.sections.verticalDimension' },
  { keys: ['maxLengthOfCentrals'], labelKey: 'cnbForm.sections.maxLengthOfCentrals' },
  { keys: ['checkDesign'], labelKey: 'cnbForm.sections.checkDesign' },
  { keys: ['occlusalContact'], labelKey: 'cnbForm.sections.occlusalContact' },
  { keys: ['rxNotes'], labelKey: 'cnbForm.sections.rxNotes' },
];

const ESP: Section[] = [
  {
    keys: ['toothAssignments', 'notation', 'treatmentNotes'],
    labelKey: 'cnbForm.sections.treatments',
  },
  { keys: ['misalignment', 'misalignmentOther'], labelKey: 'espForm.misalignment.label' },
  {
    keys: ['gingivalContouring', 'needsGingivalReductionGuide'],
    labelKey: 'espForm.gingival.label',
  },
  {
    keys: ['verticalDimension', 'verticalDimensionMm'],
    labelKey: 'espForm.verticalDimension.label',
  },
  { keys: ['maxLength', 'maxLengthOther'], labelKey: 'espForm.maxLength.label' },
  { keys: ['shade', 'shadeScale', 'shadeNotes'], labelKey: 'cnbForm.sections.shade' },
  { keys: ['smileType'], labelKey: 'espForm.smileType.label' },
  { keys: ['notes'], labelKey: 'espForm.notes.label' },
];

const MODEL: Section[] = [
  { keys: ['modelType'], labelKey: 'modelForm.modelType.label' },
  { keys: ['articulatorAlignment'], labelKey: 'modelForm.articulatorAlignment.label' },
  { keys: ['arch'], labelKey: 'modelForm.arch.label' },
  { keys: ['markings'], labelKey: 'modelForm.markings.label' },
  { keys: ['baseType'], labelKey: 'modelForm.baseType.label' },
  { keys: ['preparedDies'], labelKey: 'modelForm.preparedDies.label' },
  { keys: ['notes'], labelKey: 'modelForm.notes.label' },
];

const GRG: Section[] = [
  { keys: ['teeth'], labelKey: 'grgForm.teeth.label' },
  { keys: ['additiveWaxUp'], labelKey: 'grgForm.additiveWaxUp.label' },
  { keys: ['approvalNeeded'], labelKey: 'grgForm.approvalNeeded.label' },
  { keys: ['notes'], labelKey: 'grgForm.notes.label' },
];

/** The five sections the surgical guide repeats for each jaw it covers. */
function sgJaw(jaw: 'upper' | 'lower'): Section[] {
  const k = (name: string) => `${jaw}.${name}`;
  return [
    { keys: [k('condition')], labelKey: 'sgForm.jawCondition.label', jaw },
    {
      keys: [k('allOnProtocol'), k('implantPositions')],
      labelKey: 'sgForm.implantPositions.label',
      jaw,
    },
    { keys: [k('guideSupport')], labelKey: 'sgForm.guideSupport.label', jaw },
    {
      keys: [k('implantDetails'), k('sameImplantSystem')],
      labelKey: 'sgForm.implantSystem.label',
      jaw,
    },
    {
      keys: [
        k('needsOcclusionGuide'),
        k('prostheticSetup'),
        k('jawRelationTransfer'),
        k('existingDenture'),
        k('useExistingDentureRef'),
        k('planOnFutureProsthetics'),
      ],
      labelKey: 'sgForm.edentulous.sectionLabel',
      jaw,
    },
  ];
}

const SG: Section[] = [
  { keys: ['guideProtocol'], labelKey: 'sgForm.guideProtocol.label' },
  { keys: ['jaw'], labelKey: 'sgForm.jaw.label' },
  ...sgJaw('upper'),
  ...sgJaw('lower'),
  { keys: ['abutmentType'], labelKey: 'sgForm.abutment.label' },
  {
    keys: ['directRestoration', 'tempShade', 'tempCustomShade', 'tempTeeth', 'tempNotes'],
    labelKey: 'sgForm.restoration.label',
  },
];

const IMPLANT: Section[] = [
  { keys: ['brand', 'brandCustom'], labelKey: 'implantForm.sections.brand' },
  { keys: ['implantPositions', 'notation'], labelKey: 'implantForm.sections.positions' },
  {
    keys: ['configsByPosition', 'submittedPositions'],
    labelKey: 'implantForm.sections.configure',
  },
  { keys: ['bar'], labelKey: 'implantForm.sections.bar' },
  { keys: ['cnbAnswers'], labelKey: 'implantForm.sections.crownRestoration' },
];

const PRINT: Section[] = [
  { keys: ['materialId'], labelKey: 'fabForm.material' },
  { keys: ['units'], labelKey: 'fabForm.units' },
  { keys: ['notes'], labelKey: 'fabForm.notes' },
];

const MILLING: Section[] = [
  { keys: ['materialId'], labelKey: 'fabForm.material' },
  { keys: ['teeth'], labelKey: 'fabForm.teeth' },
  { keys: ['notes'], labelKey: 'fabForm.notes' },
];

/**
 * The section table for a template, or `null` for a form we have no table for
 * — a plain `OTHER_CUSTOM` builder form, whose questions are real `fields[]`
 * entries and are handled per-question instead.
 */
export function sectionsForTemplate(templateCode: string | undefined): Section[] | null {
  if (!templateCode) return null;
  if (isCnbTemplate(templateCode)) return CNB;
  if (isModelTemplateCode(templateCode)) return MODEL;
  if (templateCode === TEMPLATE_CODE_ESP) return ESP;
  if (templateCode === TEMPLATE_CODE_GRG) return GRG;
  if (templateCode === TEMPLATE_CODE_SG) return SG;
  if (templateCode === TEMPLATE_CODE_IMPLANT) return IMPLANT;
  if (templateCode === TEMPLATE_CODE_PRINT) return PRINT;
  if (templateCode === TEMPLATE_CODE_MILLING) return MILLING;
  return null;
}

/** `upper.condition` → `answers.upper.condition`, tolerating a missing parent. */
function readPath(values: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[part];
  }, values);
}

/** One line in the "what changed" summary. */
export type ChangedItem =
  /** A section of the clinical template; translate `labelKey` in `lab`. */
  | { kind: 'section'; labelKey: string; jaw?: 'upper' | 'lower' }
  /** A question the lab appended; `label` is the lab's own wording. */
  | { kind: 'question'; label: string }
  /**
   * Something changed that no section claims. Shown rather than swallowed:
   * this table is hand-maintained, and a template that gains an answer key
   * would otherwise report an edit as touching nothing at all.
   */
  | { kind: 'other' };

/**
 * The questions this edit actually touched, in the order the form asks them.
 */
export function changedItems(
  configuration: FormConfiguration,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ChangedItem[] {
  const items: ChangedItem[] = [];
  const sections = sectionsForTemplate(configuration._templateCode);
  const claimed = new Set<string>();

  for (const section of sections ?? []) {
    // Only the first path segment can be compared against the answer's own
    // top-level keys, which is what `claimed` is used for below.
    for (const key of section.keys) claimed.add(key.split('.')[0]);
    const changed = section.keys.some((key) =>
      !valuesEqual(readPath(before, key), readPath(after, key)),
    );
    if (changed) items.push({ kind: 'section', labelKey: section.labelKey, jaw: section.jaw });
  }

  // The lab's appended questions carry their own label, so they need no table.
  const questions = configuration.fields.filter(
    (f) => f.enabled && (sections ? f.type === 'custom_question' : f.visible_to_doctor !== false),
  );
  for (const f of questions) {
    claimed.add(f.code);
    if (!valuesEqual(before[f.code], after[f.code])) {
      items.push({ kind: 'question', label: f.label });
    }
  }

  const unclaimed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => !claimed.has(k),
  );
  if (unclaimed.some((k) => !valuesEqual(before[k], after[k]))) items.push({ kind: 'other' });

  return items;
}
