import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  EMPTY_FILTERS,
  TURNAROUND_BUCKETS,
  isCategory,
  type CatalogueFilters,
} from './catalogue';

/*
 * The catalogue's filters live in the URL, next to the clinic's `?doctor=`:
 * coming back from a lab's page (browser back) restores them, and a filtered
 * catalogue can be shared as a link. Every write replaces the history entry,
 * so typing a search never piles up back-button stops.
 */

const P = {
  search: 'q',
  categories: 'type',
  materials: 'mat',
  city: 'city',
  maxDays: 'days',
  rush: 'rush',
} as const;

const unique = <T>(xs: T[]) => [...new Set(xs)];

function parse(params: URLSearchParams): CatalogueFilters {
  const days = Number(params.get(P.maxDays));
  return {
    search: params.get(P.search) ?? '',
    categories: unique(params.getAll(P.categories).filter(isCategory)),
    materials: unique(params.getAll(P.materials).filter(Boolean)),
    city: params.get(P.city) || null,
    maxDays: (TURNAROUND_BUCKETS as readonly number[]).includes(days) ? days : null,
    rush: params.get(P.rush) === '1',
  };
}

function write(params: URLSearchParams, f: CatalogueFilters) {
  Object.values(P).forEach((k) => params.delete(k));
  if (f.search) params.set(P.search, f.search);
  f.categories.forEach((c) => params.append(P.categories, c));
  f.materials.forEach((m) => params.append(P.materials, m));
  if (f.city) params.set(P.city, f.city);
  if (f.maxDays) params.set(P.maxDays, String(f.maxDays));
  if (f.rush) params.set(P.rush, '1');
}

/**
 * The catalogue's own query out of any URL's params — its filters and the
 * clinic's `doctor` — as "?…", or "" when there is none. A lab's page is
 * linked with it, so its breadcrumb leads back to the same filtered list.
 */
export function catalogueQuery(params: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const k of ['doctor', ...Object.values(P)]) {
    params.getAll(k).forEach((v) => q.append(k, v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export type FilterUpdate =
  | Partial<CatalogueFilters>
  | ((current: CatalogueFilters) => Partial<CatalogueFilters>);

export function useCatalogueFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parse(params), [params]);

  const update = useCallback(
    (change: FilterUpdate) =>
      setParams(
        (prev) => {
          const current = parse(prev);
          const patch = typeof change === 'function' ? change(current) : change;
          // Anything else in the URL — the clinic's `doctor` — is kept.
          const next = new URLSearchParams(prev);
          write(next, { ...current, ...patch });
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const clear = useCallback(() => update(EMPTY_FILTERS), [update]);

  return { filters, update, clear };
}
