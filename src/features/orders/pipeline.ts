import type { OrderStatus } from '@/types/database';

/**
 * The six-stage case pipeline the mockups draw — as the mini progress bar under
 * each order row, and as the stepper on the order detail screen.
 *
 * The domain has more statuses than the pipeline has stages: a clarification
 * request, a try-in and a clinic hand-off are moments *inside* a stage rather
 * than stages of their own. `pipelineIndex` maps every status onto the stage it
 * is really at, so both views agree.
 */
export const ORDER_PIPELINE = [
  'SUBMITTED',
  'RECEIVED',
  'IN_PROGRESS',
  'READY_FOR_DELIVERY',
  'SENT_TO_CLINIC',
  'COMPLETED',
] as const satisfies readonly OrderStatus[];

export type PipelineStage = (typeof ORDER_PIPELINE)[number];

/** Material Symbols glyph per stage, matching the detail-screen stepper. */
export const PIPELINE_ICONS: Record<PipelineStage, string> = {
  SUBMITTED: 'send',
  RECEIVED: 'inbox',
  IN_PROGRESS: 'precision_manufacturing',
  READY_FOR_DELIVERY: 'package_2',
  SENT_TO_CLINIC: 'local_shipping',
  COMPLETED: 'task_alt',
};

const OFF_PIPELINE: Partial<Record<OrderStatus, number>> = {
  // The lab has the case and is asking a question — still stage "Received".
  NEEDS_CLARIFICATION: 1,
  // Same stage: the lab is waiting on the doctor, not working.
  NEEDS_DOCTOR_INPUT: 1,
  // A try-in happens mid-fabrication.
  TRY_IN_PHASE: 2,
  // The clinic has it; delivery is done but the case is not closed.
  RECEIVED_BY_CLINIC: 4,
};

/** Index into `ORDER_PIPELINE`, or `null` for a cancelled order. */
export function pipelineIndex(status: OrderStatus): number | null {
  if (status === 'CANCELLED') return null;
  const direct = (ORDER_PIPELINE as readonly string[]).indexOf(status);
  if (direct >= 0) return direct;
  return OFF_PIPELINE[status] ?? 0;
}

export const isComplete = (status: OrderStatus) => status === 'COMPLETED';
