/**
 * Find the first errored element in the current view and scroll it into the
 * center of the viewport. Called from wizard step handlers after a failed
 * Next-click. We try `data-form-error` (our explicit tag) first, then fall
 * back to MUI's `aria-invalid="true"`, which it sets on TextFields when
 * `error={true}`.
 */
export function scrollToFirstError(root: ParentNode = document): void {
  // requestAnimationFrame waits for React to commit the error styling before
  // we query the DOM — otherwise we might find nothing.
  requestAnimationFrame(() => {
    const selector = '[data-form-error="true"], [aria-invalid="true"]';
    const target = root.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Best-effort focus for keyboard users — only inputs are focusable.
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      target.focus({ preventScroll: true });
    }
  });
}
