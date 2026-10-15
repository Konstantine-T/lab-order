import { isCnbTemplate } from '@/features/orderForms/cnbTypes';
import { TEMPLATE_CODE_SG } from '@/features/orderForms/sgTypes';
import { TEMPLATE_CODE_ESP } from '@/features/orderForms/espTypes';
import { TEMPLATE_CODE_GRG } from '@/features/orderForms/grgTypes';
import {
  TEMPLATE_CODE_IMPLANT,
  TEMPLATE_CODE_IMPLANT_ABUTMENTS,
} from '@/features/orderForms/implantTypes';
import { TEMPLATE_CODE_MILLING } from '@/features/orderForms/fabTypes';
import { readPath } from './answerSections';
import { valuesEqual } from './diff';

/**
 * Which teeth a doctor's edit touched, chart by chart, so the lab's edit review
 * can mark the teeth themselves and not only the section around a 32-tooth
 * chart.
 *
 * A tooth is changed when anything stored for it differs between the two
 * versions: it was added or removed, or its treatment, material, implant
 * configuration or the like changed. Each chart says what "stored for a tooth"
 * means for it (a `Reader`); the comparison itself is `valuesEqual`, the one
 * the section diff uses, so the two can never disagree about a value.
 *
 * Charts are keyed by the answer path of the list they draw
 * (`toothAssignments`, `upper.implantPositions`, `cnbAnswers.toothAssignments`):
 * that is how a form, which knows where its own answers live, asks for its
 * chart's marks (`useChangedTeeth`). Teeth are Universal (1-32), as stored.
 */

/** Everything stored for each tooth on one chart, by Universal number. */
type ToothRecords = Map<number, unknown>;
type Reader = (answers: Record<string, unknown>) => ToothRecords;
type Chart = { path: string; read: Reader };

const isTooth = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 32;

const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** A plain list of teeth (`[4, 5, 12]`): each one is either on it or not. */
function teethList(value: unknown): ToothRecords {
  const m: ToothRecords = new Map();
  if (Array.isArray(value)) for (const n of value) if (isTooth(n)) m.set(n, true);
  return m;
}

const teethAt =
  (path: string): Reader =>
  (answers) =>
    teethList(readPath(answers, path));

/**
 * The treatments chart's rows (`{ tooth, materialId }`): every row stored for
 * a tooth, whole, so a new material or any other field on the row counts.
 */
const assignmentsAt =
  (path: string): Reader =>
  (answers) => {
    const m: ToothRecords = new Map();
    const rows = readPath(answers, path);
    if (!Array.isArray(rows)) return m;
    for (const row of rows) {
      const tooth = asObject(row)?.tooth;
      if (!isTooth(tooth)) continue;
      m.set(tooth, [...((m.get(tooth) as unknown[] | undefined) ?? []), row]);
    }
    return m;
  };

/**
 * Implant positions (both implant templates). A position carries its own
 * configuration (abutment, gingival height, retention...) and, when it has no
 * brand of its own, the brand it inherits from the form, which is what the
 * sheet shows for it.
 */
const implantPositions: Reader = (answers) => {
  const m: ToothRecords = new Map();
  const configs = asObject(answers.configsByPosition);
  for (const n of teethList(answers.implantPositions).keys()) {
    const config = asObject(configs?.[String(n)]) ?? null;
    const inherited = config?.brand == null ? (answers.brand ?? null) : null;
    m.set(n, { config, inherited });
  }
  return m;
};

/**
 * One jaw's implant positions on the surgical guide, each with the implant
 * system the sheet shows for it: its own card, or the first card when the
 * doctor said every position uses the same system.
 */
const sgJawPositions =
  (jaw: 'upper' | 'lower'): Reader =>
  (answers) => {
    const m: ToothRecords = new Map();
    const data = asObject(answers[jaw]);
    if (!data) return m;
    const details = Array.isArray(data.implantDetails)
      ? data.implantDetails.map(asObject).filter((d): d is Record<string, unknown> => !!d)
      : [];
    const same = data.sameImplantSystem !== false;
    const withoutPosition = (d: Record<string, unknown> | undefined) =>
      d ? Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'position')) : null;
    for (const n of teethList(data.implantPositions).keys()) {
      m.set(n, withoutPosition(same ? details[0] : details.find((d) => d.position === n)));
    }
    return m;
  };

const TREATMENTS: Chart[] = [{ path: 'toothAssignments', read: assignmentsAt('toothAssignments') }];

/** Both implant templates: the positions, and the positions under the bar. */
const IMPLANT_CONFIGURATION: Chart[] = [
  { path: 'implantPositions', read: implantPositions },
  { path: 'bar.barTeeth', read: teethAt('bar.barTeeth') },
];

const IMPLANT: Chart[] = [
  ...IMPLANT_CONFIGURATION,
  // The crown restoration's own treatments chart, nested in the implant answers.
  { path: 'cnbAnswers.toothAssignments', read: assignmentsAt('cnbAnswers.toothAssignments') },
];

const SG: Chart[] = [
  { path: 'upper.implantPositions', read: sgJawPositions('upper') },
  { path: 'lower.implantPositions', read: sgJawPositions('lower') },
  { path: 'tempTeeth', read: teethAt('tempTeeth') },
];

const TEETH: Chart[] = [{ path: 'teeth', read: teethAt('teeth') }];

/**
 * The tooth charts a template draws. Model and 3D print store no teeth, and a
 * plain builder form's tooth questions are compared one by one by the caller
 * (`changedTeethIn`).
 */
function chartsForTemplate(templateCode: string | undefined): Chart[] {
  if (!templateCode) return [];
  // Crown & Bridge and every form built on it (temporary crown, titanium
  // milling, final construction), then Evident Smile's own treatments chart.
  if (isCnbTemplate(templateCode) || templateCode === TEMPLATE_CODE_ESP) return TREATMENTS;
  if (templateCode === TEMPLATE_CODE_IMPLANT) return IMPLANT;
  if (templateCode === TEMPLATE_CODE_IMPLANT_ABUTMENTS) return IMPLANT_CONFIGURATION;
  if (templateCode === TEMPLATE_CODE_SG) return SG;
  if (templateCode === TEMPLATE_CODE_GRG || templateCode === TEMPLATE_CODE_MILLING) return TEETH;
  return [];
}

/** Teeth whose records differ, in Universal order (round the arch). */
function diffRecords(before: ToothRecords, after: ToothRecords): number[] {
  const teeth = new Set([...before.keys(), ...after.keys()]);
  return [...teeth]
    .filter((n) => !valuesEqual(before.get(n), after.get(n)))
    .sort((a, b) => a - b);
}

/**
 * The changed teeth of every chart this template draws, by the chart's answer
 * path. A chart nothing changed on is left out.
 */
export function changedTeethByChart(
  templateCode: string | undefined,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const chart of chartsForTemplate(templateCode)) {
    const teeth = diffRecords(chart.read(before), chart.read(after));
    if (teeth.length > 0) out.set(chart.path, teeth);
  }
  return out;
}

/** The same for one plain list of teeth, such as a builder form's tooth question. */
export function changedTeethIn(before: unknown, after: unknown): number[] {
  return diffRecords(teethList(before), teethList(after));
}
