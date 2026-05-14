import type { TFunction } from 'i18next';

/**
 * Resolve the localized name for a platform form template, falling back to
 * the DB-provided English name when no translation exists for the code.
 */
export function templateName(
  t: TFunction,
  code: string | undefined | null,
  fallback?: string,
): string {
  if (!code) return fallback ?? '';
  return t(`templates.${code}.name`, { defaultValue: fallback ?? code });
}

/** Same as templateName, for the descriptive blurb shown on template cards. */
export function templateDescription(
  t: TFunction,
  code: string | undefined | null,
  fallback?: string | null,
): string | undefined {
  if (!code) return fallback ?? undefined;
  const v = t(`templates.${code}.description`, { defaultValue: fallback ?? '' });
  return v || undefined;
}
