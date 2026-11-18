/**
 * The landing page's motion, after the 2026-11 landing design (the exported
 * "Dentallabs.ge — Landing" page): the hero arrives in a short stagger and its
 * order card fills itself in (the teeth, the stage bar, "confirmed") and then
 * floats; further down, sections rise into place as they scroll in, the step
 * rules draw, and a hairline along the top tracks the scroll.
 *
 * Motion only. Every element ends exactly as it is drawn without any of this:
 *   - All of it sits behind `prefers-reduced-motion: no-preference`.
 *   - The scroll-driven parts (`animation-timeline`) apply only where the
 *     browser has them (Chromium today). Elsewhere the page is simply static
 *     and fully visible, never stuck at an animation's start.
 *   - Arrivals fill `backwards`, not `both`: they hold their first frame
 *     through their delay, then let go, so each element ends on its own style
 *     rather than a held copy of it. A held identity transform looks the same
 *     but keeps the element on a compositor layer, which renders its text a
 *     shade softer than the still page.
 *   - They animate `translate` / `scale`, the individual transform
 *     properties, never `transform`, which the hover lifts use.
 *
 * The keyframes are global (`lp-` names), declared once by the page through
 * `LANDING_KEYFRAMES`.
 */

export const MOTION = '@media (prefers-reduced-motion: no-preference)';
export const VIEW = '@supports (animation-timeline: view())';
const SCROLL = '@supports (animation-timeline: scroll())';

/** The design's easing: a quick start that settles softly. */
export const EASE = 'cubic-bezier(.2,.7,.2,1)';
/** For what draws itself (the headline underline): slow in, slow out. */
export const DRAW = 'cubic-bezier(.6,0,.2,1)';
/** The "confirmed" pop, which overshoots a touch. */
export const POP = 'cubic-bezier(.2,1.4,.4,1)';

/** The headline underline's thickness, which the draw animates to. */
export const UNDERLINE = '0.075em';

export const LANDING_KEYFRAMES = {
  '@keyframes lp-rise': {
    from: { opacity: 0, translate: '0 22px' },
    to: { opacity: 1, translate: 'none' },
  },
  '@keyframes lp-card-in': {
    from: { opacity: 0, translate: '0 40px', scale: '.97' },
    to: { opacity: 1, translate: 'none', scale: 'none' },
  },
  '@keyframes lp-float': {
    '0%, 100%': { translate: '0 0' },
    '50%': { translate: '0 -8px' },
  },
  '@keyframes lp-underline': { from: { backgroundSize: `0% ${UNDERLINE}` } },
  // Into the colours ToothMap gives a selected tooth (the element's own), from
  // an unselected tooth's, which the chart sets as variables.
  '@keyframes lp-tooth': {
    from: { fill: 'var(--lp-tooth-fill)', stroke: 'var(--lp-tooth-stroke)' },
  },
  '@keyframes lp-fill': { from: { backgroundSize: '0% 100%, auto' } },
  '@keyframes lp-pulse': {
    '0%': { boxShadow: '0 0 0 0 var(--lp-pulse)' },
    '80%, 100%': { boxShadow: '0 0 0 7px transparent' },
  },
  '@keyframes lp-blink': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.35 },
  },
  '@keyframes lp-pop': {
    from: { opacity: 0, scale: '.8' },
    to: { opacity: 1, scale: 'none' },
  },
  '@keyframes lp-rv': {
    from: { opacity: 0, translate: '0 36px' },
    to: { opacity: 1, translate: 'none' },
  },
  '@keyframes lp-rv-scale': {
    from: { opacity: 0, translate: '0 40px', scale: '.96' },
    to: { opacity: 1, translate: 'none', scale: 'none' },
  },
  '@keyframes lp-draw-x': {
    from: { scale: '0 1' },
    to: { scale: '1 1' },
  },
  '@keyframes lp-faq-in': {
    from: { opacity: 0, translate: '0 -6px' },
    to: { opacity: 1, translate: 'none' },
  },
} as const;

/** The hero's arrival, `step` 0 first, 80ms apart (the design's `.in1`–`.in5`). */
export const heroIn = (step: number) => ({
  [MOTION]: { animation: `lp-rise .9s ${EASE} ${(step * 0.08).toFixed(2)}s backwards` },
});

/** The hero's order card: up into place, then a slow float. Two boxes, one each. */
export const cardIn = { [MOTION]: { animation: `lp-card-in 1.1s ${EASE} .2s backwards` } };
export const cardFloat = { [MOTION]: { animation: 'lp-float 7s ease-in-out 1.4s infinite' } };

/** A live dot's slow blink. */
export const blink = { [MOTION]: { animation: 'lp-blink 2s ease-in-out infinite' } };

/**
 * Rises into place as it scrolls into view. `step` staggers siblings (the
 * design's `.d1`–`.d3`); `scale` is the larger panels' variant, which also
 * grows a little.
 */
export const reveal = (step = 0, scale = false) => {
  const d = Math.min(step, 3) * 8;
  return {
    [MOTION]: {
      [VIEW]: {
        // `animation` first: the shorthand resets the timeline and range.
        animation: `${scale ? 'lp-rv-scale' : 'lp-rv'} linear backwards`,
        animationTimeline: 'view()',
        animationRange: scale ? 'entry 0% entry 80%' : `entry ${d}% entry ${70 + d}%`,
      },
    },
  };
};

/**
 * A rule drawing itself from the left as it scrolls in, for a thin bar. The
 * bare properties: the caller puts them inside `MOTION` and `VIEW`, where it
 * also swaps in the bar it draws over.
 */
export const RULE_DRAW = {
  transformOrigin: 'left',
  animation: 'lp-draw-x linear backwards',
  animationTimeline: 'view()',
  animationRange: 'entry 20% cover 35%',
} as const;

/**
 * The page's scroll progress, on a fixed hairline. Hidden where it cannot
 * follow the scroll. `both`, unlike the arrivals: at the very bottom the
 * timeline is at its end, and the bar must stay drawn there.
 */
export const scrollProgress = {
  scale: '0 1',
  transformOrigin: 'left',
  [MOTION]: {
    [SCROLL]: {
      animation: 'lp-draw-x linear both',
      animationTimeline: 'scroll(root)',
    },
  },
};

/** A tile's hover: a 4px lift (motion only) over the shadow it gains. */
export const hoverLift = {
  transition: `transform .35s ${EASE}, box-shadow .35s, border-color .35s`,
  [MOTION]: { '&:hover': { transform: 'translateY(-4px)' } },
};

/** The design's hover fade for links that change colour. */
export const colorFade = { transition: 'color .2s' };
