import { useEffect, useRef } from 'react';

/** How much of the remaining distance each frame covers. */
const EASING = 0.15;
const SETTLED = 0.01;

/**
 * Tilts an element a few degrees towards the pointer and tracks a sheen with it:
 * sets `--rx` / `--ry` (the tilt) and `--mx` / `--my` (the pointer, in percent)
 * and `data-lit` while the pointer is over it. The element's own styles read
 * those; without them it simply stays flat.
 *
 * It writes to the element directly, never to React state, so moving the mouse
 * across a catalogue re-renders nothing, and it only animates until the tilt has
 * caught up with the pointer. Mouse only, and off under reduced motion.
 */
export function useCardTilt<T extends HTMLElement>(amplitude = 3) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined;
    }

    let rx = 0;
    let ry = 0;
    let targetX = 0;
    let targetY = 0;
    let frame = 0;

    const tick = () => {
      rx += (targetX - rx) * EASING;
      ry += (targetY - ry) * EASING;
      el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
      el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
      const settled = Math.abs(targetX - rx) < SETTLED && Math.abs(targetY - ry) < SETTLED;
      frame = settled ? 0 : requestAnimationFrame(tick);
    };
    const run = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width) * 2 - 1;
      const y = ((e.clientY - box.top) / box.height) * 2 - 1;
      targetY = x * amplitude;
      targetX = -y * amplitude;
      el.style.setProperty('--mx', `${((x + 1) * 50).toFixed(1)}%`);
      el.style.setProperty('--my', `${((y + 1) * 50).toFixed(1)}%`);
      el.dataset.lit = '';
      run();
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      delete el.dataset.lit;
      run();
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [amplitude]);

  return ref;
}
