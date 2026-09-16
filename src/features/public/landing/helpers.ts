import type { MouseEvent } from 'react';
import { useTheme } from '@mui/material';
import { surfaces, tone } from '@/theme/tokens';

/** Colours the design hard-codes, resolved for the current theme. */
export function useLandingTones() {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const s = surfaces[mode];
  return {
    subtle: s.subtle,
    muted: s.textMuted,
    brandTint: tone('brand', mode),
    danger: tone('danger', mode),
    // The closing CTA's "ink" surface: the design's darkest navy. Fixed in
    // both themes on purpose — it is a brand surface, not a page background.
    ink: '#0F172A',
    inkText: '#F1F2FA',
    inkMuted: '#A1A6BD',
  };
}

/**
 * Smooth-scroll to an in-page section. The nav is sticky, so each target
 * carries a `scroll-margin-top` (the page's `anchored` style) and the hash is
 * replaced rather than pushed, so Back leaves the page instead of walking
 * back through every section visited.
 */
export function scrollToAnchor(e: MouseEvent<HTMLAnchorElement>) {
  const href = e.currentTarget.getAttribute('href');
  if (!href || !href.startsWith('#')) return;
  const el = document.getElementById(href.slice(1));
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.history.replaceState(null, '', href);
}

/** Height of the sticky nav, which anchored sections must clear. */
export const NAV_HEIGHT = 64;
