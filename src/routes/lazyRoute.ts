import { createElement, lazy, useState, type ComponentType } from 'react';
import { reloadForStaleChunk } from './chunkReload';

/** A lazy route's chunk did not load. `ChunkErrorBoundary` shows these, and only these. */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'ChunkLoadError';
  }
}

type Loader = () => Promise<{ default: ComponentType }>;

/**
 * `React.lazy` for a route module, plus the three things the router needs
 * from it:
 *
 *   - `preload()` starts the download ahead of the click. A failed preload is
 *     silent; the render that follows tries again.
 *   - Once the module is in, a new mount renders it directly instead of going
 *     through `lazy` again, so coming back to a loaded area — or opening the
 *     guest wizard after its preload finished — never shows a spinner frame.
 *     The component is fixed per mount, so a later load cannot swap it and
 *     remount the page.
 *   - A failed load reloads the page once (a deploy removed the chunk, see
 *     `chunkReload.ts`); failing that, it throws a `ChunkLoadError` for
 *     `LazyBoundary` to show. The failure is final until the page is
 *     reloaded, which is what that screen's button does.
 */
export function lazyRoute(load: Loader) {
  let loaded: ComponentType | null = null;
  let inflight: ReturnType<Loader> | null = null;

  const fetchModule = () => {
    if (!inflight) {
      const attempt = load().then((mod) => {
        loaded = mod.default;
        return mod;
      });
      attempt.catch(() => {
        if (inflight === attempt) inflight = null;
      });
      inflight = attempt;
    }
    return inflight;
  };

  // One `lazy` per route, never swapped: React re-runs a suspended mount from
  // scratch, so handing it a fresh `lazy` after a failure would start another
  // download instead of reaching the error boundary — an endless loop.
  const suspending = lazy(() =>
    fetchModule().catch((cause: unknown) => {
      if (reloadForStaleChunk()) return new Promise<never>(() => {});
      throw new ChunkLoadError(cause);
    }),
  );

  function LazyRoute() {
    const [Component] = useState<ComponentType>(() => loaded ?? suspending);
    return createElement(Component);
  }

  return Object.assign(LazyRoute, {
    preload: () => {
      fetchModule().catch(() => {});
    },
  });
}
