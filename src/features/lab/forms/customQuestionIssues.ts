import type { FormConfiguration } from '@/types/database';

/**
 * What is wrong with a lab-appended question, if anything.
 *
 * `index` is the question's position among the custom questions only — not its
 * index in `fields`, which also holds the template's own entries and would
 * point the lab at the wrong row.
 */
export type CustomQuestionIssue = { kind: 'label'; index: number };

/**
 * Custom questions that cannot be published as they stand.
 *
 * A question with a blank label renders to the doctor as a numbered section
 * with an empty heading — an input under a blank title, which is worse than
 * not asking at all. Found on a live service: section 10 of a Crown & Bridge
 * form was exactly that.
 *
 * `isCustomFormComplete` enforces the same rule, but it judges the whole
 * config and only runs for OTHER_CUSTOM services. On a template form most
 * fields belong to the template — their labels come from translation keys and
 * are legitimately blank in the config — so it cannot be pointed at one. This
 * looks only at what the lab wrote.
 *
 * Only the label is checked, because on a template form that is the only thing
 * the lab supplies: `addCustomQuestion` always creates `type: 'custom_question'`,
 * which FieldRenderer draws as a plain text input. The typed variants (select,
 * date, …) exist only on OTHER_CUSTOM forms, which go through CustomFormBuilder.
 *
 * Disabled questions are skipped: they are not rendered, so they block nothing.
 */
export function customQuestionIssues(
  configuration: FormConfiguration | null | undefined,
): CustomQuestionIssue[] {
  const custom = (configuration?.fields ?? []).filter(
    (f) => f.type === 'custom_question' && f.enabled,
  );

  return custom.flatMap((f, index) => (f.label.trim() ? [] : [{ kind: 'label' as const, index }]));
}

/** Minimal shape of the i18next `t` we need — matches useTranslation('lab').t. */
type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * One line per issue for the "can't publish yet" callout. Indices are shown
 * 1-based, the way the builder numbers the questions on screen.
 */
export function customQuestionIssueMessage(issue: CustomQuestionIssue, t: TranslateFn): string {
  switch (issue.kind) {
    case 'label':
      return t('services.create.customQuestionIssues.needsLabel', { index: issue.index + 1 });
  }
}
