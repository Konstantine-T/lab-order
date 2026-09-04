import { isOrderFormValid } from '@/features/orderForms/OrderForm';
import type { FormConfiguration, PricingConfig } from '@/types/database';

/**
 * Everything unfilled or invalid on an order, named.
 *
 * Submit used to fail with `common:errors.required` — "This field is
 * required." — used as a page-level banner. A field-level string cannot name a
 * field, so a doctor who left the due date blank was told only that something,
 * somewhere, was required, and the due-date input itself rendered as if
 * nothing were wrong.
 *
 * Modelled on `pricingIssueMessages.ts`, which already does exactly this for
 * the lab's publish blockers. The doctor side just never got it.
 */
export type OrderProblem =
  | { field: 'patientName' }
  | { field: 'formAnswers' }
  | { field: 'workLocation' }
  | { field: 'dueDate'; kind: 'missing' }
  | { field: 'dueDate'; kind: 'tooSoon'; minDays: number }
  /** Edit page only. */
  | { field: 'editReason' }
  | { field: 'editComment' };

export type OrderProblemInput = {
  patient: { first_name: string; last_name: string };
  answers: Record<string, unknown>;
  doctor_work_location_id: string;
  requested_due_date: string;
  /** Absent until the lab's form loads; answers can't be judged without it. */
  configuration?: FormConfiguration;
  pricing?: PricingConfig;
  /** Soonest the lab can deliver, from its turnaround + the rush choice. */
  minDays: number;
  /** True when the doctor has no work locations at all — a different problem,
   *  and one the page already explains with its own callout. */
  noLocations?: boolean;
  /**
   * False on the edit page, which shows the due date read-only. Without it an
   * old order's past due date would be reported as "too soon" every time the
   * doctor saved an edit.
   */
  checkDueDate?: boolean;
  /** Edit page only; omitted on create. */
  edit?: { reasonCode: string; comment: string; commentRequired: boolean };
};

/**
 * In page order, not severity order, so the banner reads top-to-bottom as the
 * doctor scrolls to fix things.
 *
 * Every problem, not just the first: the old gauntlet returned on each one in
 * turn, so a doctor missing three things had to submit three times to find
 * that out.
 */
export function collectOrderProblems(input: OrderProblemInput): OrderProblem[] {
  const problems: OrderProblem[] = [];

  if (!input.patient.first_name.trim() || !input.patient.last_name.trim()) {
    problems.push({ field: 'patientName' });
  }

  if (
    input.configuration &&
    !isOrderFormValid(input.configuration, input.answers, input.pricing)
  ) {
    problems.push({ field: 'formAnswers' });
  }

  // A doctor with no locations at all is not "missing a selection" — the page
  // already tells them to add one, and marking the absent field red on top of
  // that says the same thing twice.
  if (!input.doctor_work_location_id && !input.noLocations) {
    problems.push({ field: 'workLocation' });
  }

  if (input.checkDueDate !== false) {
    if (!input.requested_due_date) {
      problems.push({ field: 'dueDate', kind: 'missing' });
    } else if (isTooSoon(input.requested_due_date, input.minDays)) {
      problems.push({ field: 'dueDate', kind: 'tooSoon', minDays: input.minDays });
    }
  }

  if (input.edit) {
    if (!input.edit.reasonCode) problems.push({ field: 'editReason' });
    if (input.edit.commentRequired && !input.edit.comment.trim()) {
      problems.push({ field: 'editComment' });
    }
  }

  return problems;
}

/**
 * Dates are ISO `YYYY-MM-DD`, and the minimum is "today plus N days" at
 * day granularity — compared as strings so this stays free of dayjs and can be
 * called from anywhere.
 */
function isTooSoon(date: string, minDays: number): boolean {
  const min = new Date();
  min.setHours(0, 0, 0, 0);
  min.setDate(min.getDate() + minDays);
  const iso = `${min.getFullYear()}-${String(min.getMonth() + 1).padStart(2, '0')}-${String(
    min.getDate(),
  ).padStart(2, '0')}`;
  return date < iso;
}

/** Minimal shape of the i18next `t` we need. */
type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * One line per problem, naming the field the way its own label does so the
 * doctor can match the banner to the field by eye.
 */
export function orderProblemMessage(problem: OrderProblem, t: TranslateFn): string {
  const p = 'orderCreate.problems';
  switch (problem.field) {
    case 'patientName':
      return t(`${p}.patientName`);
    case 'formAnswers':
      return t(`${p}.formAnswers`);
    case 'workLocation':
      return t(`${p}.workLocation`);
    case 'dueDate':
      return problem.kind === 'missing'
        ? t(`${p}.dueDateMissing`)
        : t(`${p}.dueDateTooSoon`, { count: problem.minDays });
    case 'editReason':
      return t(`${p}.editReason`);
    case 'editComment':
      return t(`${p}.editComment`);
  }
}

/** Does this set of problems touch a given field? Drives the red outlines. */
export function hasProblem(problems: OrderProblem[], field: OrderProblem['field']): boolean {
  return problems.some((p) => p.field === field);
}

/** The due-date line, so the field can show the same words as the banner. */
export function problemFor(
  problems: OrderProblem[],
  field: OrderProblem['field'],
): OrderProblem | undefined {
  return problems.find((p) => p.field === field);
}
