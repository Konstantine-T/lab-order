import type { PricingIssue } from '@/utils/pricing';

/** Minimal shape of the i18next `t` we need — matches useTranslation('lab').t. */
type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Turn a PricingIssue into a human line for the "can't publish yet" callout.
 * Indices are shown 1-based (labs count materials from 1, not 0). Keeps the
 * publish-blocked messaging in one place so both service pages stay consistent.
 */
export function pricingIssueMessage(issue: PricingIssue, t: TranslateFn): string {
  const p = 'services.create.pricingIssues';
  switch (issue.kind) {
    case 'no-materials':
      return t(`${p}.noMaterials`);
    case 'material-name':
      return t(`${p}.materialNeedsName`, { index: issue.index + 1 });
    case 'material-price':
      return t(`${p}.materialNeedsPrice`, { name: issue.name });
    case 'fixed-price':
      return t(`${p}.fixedPrice`);
    case 'unit-price':
      return t(`${p}.unitPrice`);
    case 'model-price':
      return t(`${p}.modelNeedsPrice`);
    case 'sg-price':
      return t(`${p}.sgPrice`);
    case 'rush-value':
      return t(`${p}.rushValue`);
    case 'rush-turnaround':
      return t(`${p}.rushTurnaround`);
  }
}
