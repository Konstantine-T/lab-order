import type { PricingConfig } from '@/types/database';

/** Minimum number of days between today and the doctor's requested due date.
 *  - Rush requested → use lab's rush turnaround_days (falls back to 1).
 *  - Otherwise → use service.average_turnaround_days (falls back to 1). */
export function minTurnaroundDays(
  averageDays: number | null | undefined,
  pricing: PricingConfig | undefined,
  rushRequested: boolean,
): number {
  if (rushRequested) {
    const rd = pricing?.rush?.turnaround_days;
    if (rd && rd > 0) return rd;
  }
  return Math.max(1, averageDays ?? 1);
}
