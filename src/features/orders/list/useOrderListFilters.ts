import { useMemo, useState } from 'react';
import type { Dayjs } from 'dayjs';
import type { OrderStatus } from '@/types/database';
import { dueDateOf } from '@/features/orders/orderDates';
import {
  currentWeek,
  labNameOf,
  matchesQuick,
  optionsFrom,
  patientFullName,
  QUICK_FILTERS,
  serviceNameOf,
  type ListOrderRow,
  type QuickFilter,
} from './orderListModel';
import { useOrderSort, type OrderSortArea } from './useOrderSort';

/**
 * The orders list's filter state and what it does to the rows — shared by the
 * doctor's and the clinic's lists so the two cannot drift.
 *
 * Quick-filter counts are taken after every *other* filter: pick a lab and the
 * chips count that lab's orders, which is what a doctor reading "unpaid · 3"
 * next to "Lab: Dens" expects.
 */
export function useOrderListFilters(
  rows: ListOrderRow[],
  options: {
    /** Which list this is: each area remembers its own sort. */
    sortArea: Extract<OrderSortArea, 'doctor' | 'clinic'>;
    /** Extra text a search should match — the doctor's name on the clinic list. */
    searchText?: (row: ListOrderRow) => string;
  },
) {
  const { searchText, sortArea } = options;

  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<QuickFilter>('all');
  const [labId, setLabId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // A preference, not a filter: "Clear" leaves it alone and it survives reloads.
  const [sort, setSort] = useOrderSort(sortArea);

  const from = dateFrom?.isValid() ? dateFrom.format('YYYY-MM-DD') : null;
  const to = dateTo?.isValid() ? dateTo.format('YYYY-MM-DD') : null;
  const q = search.trim().toLowerCase();

  // Everything but the quick filter.
  const base = useMemo(
    () =>
      rows.filter((row) => {
        if (labId && row.lab_id !== labId) return false;
        if (patientId && row.patient_id !== patientId) return false;
        if (doctorId && row.doctor_id !== doctorId) return false;
        if (statuses.length > 0 && !statuses.includes(row.status)) return false;
        if (from || to) {
          const due = dueDateOf(row);
          if (due == null) return false;
          if (from && due < from) return false;
          if (to && due > to) return false;
        }
        if (q) {
          const haystack = [
            row.order_code,
            patientFullName(row),
            serviceNameOf(row),
            labNameOf(row),
            searchText?.(row) ?? '',
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      }),
    [rows, labId, patientId, doctorId, statuses, from, to, q, searchText],
  );

  const week = currentWeek();
  const weekKey = week.start;
  const counts = useMemo(
    () =>
      Object.fromEntries(
        QUICK_FILTERS.map((f) => [f, base.filter((row) => matchesQuick(row, f, week)).length]),
      ) as Record<QuickFilter, number>,
    // `week` is derived from today; its start date is the stable key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, weekKey],
  );

  const filtered = useMemo(
    () => base.filter((row) => matchesQuick(row, quick, week)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, quick, weekKey],
  );

  const labOptions = useMemo(
    () => optionsFrom(rows, (row) => ({ value: row.lab_id, label: labNameOf(row) })),
    [rows],
  );
  const patientOptions = useMemo(
    () => optionsFrom(rows, (row) => ({ value: row.patient_id, label: patientFullName(row) })),
    [rows],
  );

  /** Any filter a draft cannot match — everything but the doctor. */
  const hasOrderFilters = !!(
    q ||
    quick !== 'all' ||
    labId ||
    patientId ||
    statuses.length > 0 ||
    from ||
    to
  );
  const hasFilters = hasOrderFilters || !!doctorId;

  const clear = () => {
    setSearch('');
    setQuick('all');
    setLabId(null);
    setPatientId(null);
    setDoctorId(null);
    setStatuses([]);
    setDateFrom(null);
    setDateTo(null);
  };

  /** Changes whenever the result set's definition or its order does — groups
   *  key on it to fold back to their first page, as the old pager went back to
   *  page 1. */
  const resetKey = [q, quick, labId, patientId, doctorId, statuses.join(','), from, to, sort].join('|');

  return {
    search,
    setSearch,
    quick,
    setQuick,
    labId,
    setLabId,
    patientId,
    setPatientId,
    doctorId,
    setDoctorId,
    statuses,
    setStatuses,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    advancedOpen,
    setAdvancedOpen,
    sort,
    setSort,
    counts,
    filtered,
    labOptions,
    patientOptions,
    hasFilters,
    hasOrderFilters,
    clear,
    resetKey,
  };
}

export type OrderListFilterState = ReturnType<typeof useOrderListFilters>;
