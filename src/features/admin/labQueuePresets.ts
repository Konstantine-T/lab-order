import type { LabApprovalStatus } from '@/types/database';

/**
 * The admin home's lab squares, each one status of the lab queue. The square
 * counts `approval_status = <status>` and its click opens the queue filtered
 * to that same status, so the number is the number of rows it opens onto.
 */
export const ADMIN_LAB_SQUARES = {
  pending: 'PENDING_APPROVAL',
  active: 'APPROVED_ACTIVE',
} as const satisfies Record<string, LabApprovalStatus>;

const LAB_STATUSES: readonly LabApprovalStatus[] = [
  'PENDING_APPROVAL',
  'CHANGES_REQUESTED',
  'APPROVED_ACTIVE',
  'REJECTED',
  'SUSPENDED',
];

export const isLabApprovalStatus = (v: unknown): v is LabApprovalStatus =>
  typeof v === 'string' && (LAB_STATUSES as readonly string[]).includes(v);

/** The router state the admin home hands the lab queue. */
export type LabQueueState = { filter: LabApprovalStatus };
