import { useEffect, useState } from 'react';

/**
 * How far down the viewport the page's sticky chrome reaches — the order
 * form's header, which is sticky from `sm` up.
 *
 * Measured from what is painted at the top edge, the way `SplitLayout` and
 * `scrollToFirstError` do it, rather than from a constant: the header is the
 * shell's focused bar for a doctor (64px) but the form's own band for a guest,
 * and wraps to two rows on a narrow tablet.
 */
export function stickyChromeHeight(): number {
  if (typeof document === 'undefined') return 0;
  let bottom = 0;
  for (const el of document.elementsFromPoint(Math.round(window.innerWidth * 0.35), 1)) {
    if (!(el instanceof HTMLElement)) continue;
    const pos = getComputedStyle(el).position;
    if (pos === 'sticky' || pos === 'fixed') {
      bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
    }
  }
  return Math.round(bottom);
}

/**
 * The sticky chrome's height, kept current. Highest seen wins, as in
 * `SplitLayout`: the band is shorter mid-travel than once pinned, and letting
 * the offset shrink back makes whatever pins under it jump on every scroll.
 */
export function useStickyChromeHeight(enabled = true): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const measure = () => setHeight((prev) => Math.max(prev, stickyChromeHeight()));
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [enabled]);
  return height;
}

/** Breathing room between the sticky header and the card scrolled to. */
const GAP = 16;

/**
 * Smooth-scroll a section to just under the sticky header. `scrollIntoView`
 * would park it underneath the header, where it cannot be seen.
 */
export function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - stickyChromeHeight() - GAP;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

/** Whether all of an element is on screen, below the sticky header. */
export function isFullyVisible(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top >= stickyChromeHeight() && r.bottom <= window.innerHeight;
}
