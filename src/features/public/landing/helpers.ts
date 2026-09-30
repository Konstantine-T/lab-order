import { useEffect, type MouseEvent } from 'react';
import { useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, type LanguageCode } from '@/i18n';
import { brand, palette2026, surfaces, tone } from '@/theme/tokens';

/**
 * Colours the landing design names, resolved for the current theme.
 *
 * The design is drawn in light mode only: a white page with a mist hero, mist
 * tiles and two ink surfaces (the labs card and the footer). In dark mode the
 * page sits on the app's dark ground, "mist" becomes the tokens' 3% lift, and
 * the ink surfaces stay ink — they are brand surfaces, not page backgrounds,
 * and read as a slightly raised band against the darker ground.
 */
export function useLandingTones() {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const light = mode === 'light';
  const s = surfaces[mode];
  return {
    mode,
    /** The page itself: white on light (the hero's mist sits above it), the app ground on dark. */
    ground: light ? theme.palette.background.paper : theme.palette.background.default,
    /** Mist: the hero band, the "why" tiles, the doctors card. */
    subtle: s.subtle,
    /** Mist needs no edge on white; a 3% lift on dark does. */
    subtleEdge: light ? 'transparent' : theme.palette.divider,
    border: s.borderSolid,
    control: s.control,
    dashed: s.dashed,
    chip: s.chip,
    chipText: s.chipText,
    muted: s.textMuted,
    /** Periwinkle for the headline accent and other large type; lifted on dark. */
    accent: light ? palette2026.peri : brand.soft,
    /** Periwinkle for small text — eyebrows, links, step numbers — at AA contrast. */
    accentText: light ? palette2026.periText : brand.soft,
    accentTextHover: tone('info', mode).fg,
    /** Aqua is "done / confirmed": the check circles and the icon tiles. */
    done: tone('success', mode),
    // The ink surfaces and the text that sits on them — the same in both themes.
    ink: palette2026.ink,
    inkText: surfaces.dark.chipText,
    inkMuted: surfaces.dark.textMuted,
    inkLine: surfaces.dark.borderSolid,
  };
}

/**
 * The marketing page runs a rounder scale than the app (whose cards are 12px):
 * 14px cards and tiles, 16px for the two audience panels.
 */
export const landingRadii = { card: 14, panel: 16 } as const;

/** Height of the sticky nav, which anchored sections must clear. */
export const NAV_HEIGHT = { xs: 60, sm: 72 } as const;

/** Anchored sections land a little below the sticky nav rather than flush under it. */
export const anchoredSx = {
  scrollMarginTop: { xs: `${NAV_HEIGHT.xs + 12}px`, sm: `${NAV_HEIGHT.sm + 12}px` },
  // Focused programmatically after a section jump (see `scrollToHash`); a
  // focus ring around a whole section would only look like a glitch.
  '&:focus': { outline: 'none' },
} as const;

export const CONTACT_EMAIL = 'hello@dentallabs.ge';

/** The other Dental Chain sites. Proper names, never translated. */
export const CHAIN_SITES = {
  mall: { name: 'DentalMall.ge', href: 'https://dentalmall.ge' },
  course: { name: 'DentalCourse.ge', href: 'https://dentalcourse.ge' },
} as const;

/** A `returnObjects` translation as an array, or empty if the key is missing. */
export function listOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Smooth-scroll to an in-page section by its `#id`. The nav is sticky, so each
 * target carries `anchoredSx`, and the hash is replaced rather than pushed, so
 * Back leaves the page instead of walking back through every section visited.
 */
export function scrollToHash(hash: string, behavior: 'smooth' | 'auto' = 'smooth') {
  const el = document.getElementById(hash.replace(/^#/, ''));
  if (!el) return false;
  el.scrollIntoView({ behavior, block: 'start' });
  window.history.replaceState(null, '', hash.startsWith('#') ? hash : `#${hash}`);
  // Cancelling the native jump also cancelled its focus move, so the next Tab
  // went back to the header and the page leapt to the top. Move focus to the
  // section ourselves; `preventScroll` leaves the smooth scroll alone.
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  return true;
}

/**
 * A `/#faq` link — shared, or the page reloaded after a section jump — lands
 * at the top: the landing mounts after auth resolves, too late for the
 * browser's own fragment scroll. Do it once the sections exist.
 */
export function useInitialHashScroll() {
  useEffect(() => {
    const { hash } = window.location;
    if (!hash) return;
    const frame = requestAnimationFrame(() => scrollToHash(hash, 'auto'));
    return () => cancelAnimationFrame(frame);
  }, []);
}

/** `onClick` for an `<a href="#section">`. */
export function scrollToAnchor(e: MouseEvent<HTMLAnchorElement>) {
  const href = e.currentTarget.getAttribute('href');
  if (!href || !href.startsWith('#')) return;
  if (scrollToHash(href)) e.preventDefault();
}

/**
 * `onClick` for the brand links. This page only renders at `/`, so a router
 * link back to `/` would do nothing at all; scroll to the top instead and
 * drop any section hash.
 */
export function scrollToTop(e?: MouseEvent<HTMLElement>) {
  e?.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

const SUPPORTED_CODES = LANGUAGES.map((l) => l.code) as readonly string[];

/**
 * The active UI language, validated against `LANGUAGES`, and a setter that
 * only calls `i18n.changeLanguage` — it never navigates or touches the URL,
 * same as the app's `LanguageSwitcher`.
 */
export function useLanguage() {
  const { i18n } = useTranslation();
  const raw = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const code = (SUPPORTED_CODES.includes(raw) ? raw : 'en') as LanguageCode;
  const change = (next: LanguageCode) => {
    if (next !== code) void i18n.changeLanguage(next);
  };
  return { code, change };
}

/**
 * Sets the document title and meta description while the page is mounted,
 * following the language, and puts the previous ones back on unmount — the
 * rest of the app has no per-page titles and keeps `index.html`'s.
 */
export function useDocumentMeta(title: string, description: string) {
  useEffect(() => {
    const prevTitle = document.title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    const prevDescription = meta.content;
    return () => {
      document.title = prevTitle;
      if (created) meta?.remove();
      else if (meta) meta.content = prevDescription;
    };
  }, []);

  useEffect(() => {
    document.title = title;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = description;
  }, [title, description]);
}
