/**
 * Scroll the doctor to the first thing they need to fix, and make sure they
 * can actually see it.
 *
 * Called from the submit handlers after a failed attempt. Three things here
 * are not obvious, and each one was a bug:
 *
 * 1. WAIT TWO FRAMES, NOT ONE. The caller sets state and then calls this. A
 *    single `requestAnimationFrame` can run before React has committed the
 *    error attributes, so the query finds nothing and we return having
 *    scrolled nowhere — the doctor clicks Submit and the page sits still.
 *    That was intermittent, which is the worst kind: it worked whenever the
 *    previous attempt had left the markers in the DOM already.
 *
 * 2. THE TOPMOST ERROR, NOT THE FIRST IN THE DOM. The page is two columns —
 *    the form on the left, the summary rail on the right — and the rail comes
 *    last in source order. A due-date error in the rail is visually above a
 *    form error a thousand pixels down the left column, so `querySelector`
 *    would send the doctor *down* and away from the field nearest them.
 *
 * 3. THE HEADER IS STICKY AND OPAQUE. It is ~139px on the order wizard and
 *    covers the top of the viewport, so an element scrolled flush to the top
 *    is scrolled to somewhere the doctor cannot see. `scrollIntoView` knows
 *    nothing about it. We measure whatever sticky/fixed chrome is actually
 *    sitting at the top and clear it, rather than hardcoding a height that
 *    every page disagrees about (`layout.railTop` is 76, which is already
 *    wrong for this page).
 */

/** Breathing room between the sticky chrome and the field we land on. */
const GAP = 20;

/**
 * How far down the viewport is covered by sticky or fixed chrome.
 *
 * Measured from what is genuinely painted at the top edge rather than from a
 * constant: the wizard's header band is taller than the plain page header, and
 * a hardcoded number is wrong on one page or the other. `elementsFromPoint`
 * returns the whole stack under a point, so one probe finds the header however
 * deeply it is nested.
 */
function stickyChromeHeight(): number {
  const probes = [window.innerWidth / 2, window.innerWidth - 8];
  let bottom = 0;
  for (const x of probes) {
    for (const el of document.elementsFromPoint(x, 1)) {
      if (!(el instanceof HTMLElement)) continue;
      const pos = getComputedStyle(el).position;
      if (pos === 'sticky' || pos === 'fixed') {
        bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
      }
    }
  }
  return bottom;
}

/**
 * The errored element nearest the top of the document.
 *
 * `data-form-error` is our own tag; `aria-invalid` is what MUI sets on a
 * TextField with `error`. Both are queried so a section that marks itself and
 * a field that MUI marks are treated alike.
 */
function topmostError(root: ParentNode): HTMLElement | null {
  const found = root.querySelectorAll<HTMLElement>(
    '[data-form-error="true"], [aria-invalid="true"]',
  );
  let best: HTMLElement | null = null;
  let bestTop = Infinity;
  for (const el of found) {
    const rect = el.getBoundingClientRect();
    // A hidden field (display:none, a collapsed section) has a zero box and
    // would win every comparison while being impossible to look at.
    if (rect.width === 0 && rect.height === 0) continue;
    const top = rect.top + window.scrollY;
    if (top < bestTop) {
      bestTop = top;
      best = el;
    }
  }
  return best;
}

export function scrollToFirstError(root: ParentNode = document): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = topmostError(root);
      if (!target) return;

      const top = target.getBoundingClientRect().top + window.scrollY - stickyChromeHeight() - GAP;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

      // Best-effort focus for keyboard users — only inputs are focusable, and
      // `preventScroll` keeps it from fighting the smooth scroll we just
      // started.
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        target.focus({ preventScroll: true });
      }
    });
  });
}
