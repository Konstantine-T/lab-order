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

/**
 * Longer "how to configure this form" help copy, shown under the ? help tip on
 * a template card. Returns undefined when no `templates.<code>.help` key exists
 * yet, so the help icon simply doesn't render until copy is authored.
 */
export function templateHelp(
  t: TFunction,
  code: string | undefined | null,
): string | undefined {
  if (!code) return undefined;
  const v = t(`templates.${code}.help`, { defaultValue: '' });
  return v || undefined;
}
