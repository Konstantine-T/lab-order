import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ProgressSteps, SectionCard, type Step } from '@/components/design';
import { statusLabel } from '@/features/orders/statusLabel';
import { StatusHistoryButton } from '@/features/orders/statusHistory/StatusHistoryButton';
import { ORDER_PIPELINE, PIPELINE_ICONS, pipelineIndex } from '@/features/orders/pipeline';
import { dueDateOf } from '@/features/orders/orderDates';
import { formatGELShort } from '@/utils/pricing';
import type { OrderStaffPublicRow } from '@/types/database';
import { shortDate, shortDateTime, shortName } from './format';
import type { DetailOrder } from './types';

/**
 * The case tracker across the six pipeline stages.
 *
 * Every line under a stage is something the order row holds: a stage gets a
 * timestamp only where a column records one — `created_at` for sending,
 * `completed_at` for closing — and the rest carry facts instead: what the lab
 * confirmed, who is on the case now, and when it is due. The full timeline is
 * behind "Show status history" (0052). The mockups' "expected on the 30th" has
 * no source here and is not drawn.
 *
 * A cancelled order has no position on the pipeline: only the history button.
 */
export function OrderStepperCard({
  order,
  staff,
}: {
  order: DetailOrder;
  staff: OrderStaffPublicRow[];
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');

  const current = pipelineIndex(order.status);
  // The doctor's side: a lab's own purchases (0048) are read here too.
  const history = <StatusHistoryButton orderId={order.id} side="doctor" />;
  if (current == null) {
    return <SectionCard>{history}</SectionCard>;
  }

  const complete = order.status === 'COMPLETED';
  const due = dueDateOf(order);
  const team = staff.map((s) => shortName(s.first_name, s.last_name)).join(', ');

  const steps: Step[] = ORDER_PIPELINE.map((stage, i) => {
    const reached = complete || i <= current;
    let at: string | undefined;
    const notes: string[] = [];

    if (stage === 'SUBMITTED') at = shortDateTime(order.created_at);
    // What the lab committed to once it took the case. No timestamp: nothing
    // records when it was confirmed, only what.
    if (stage === 'RECEIVED' && reached) {
      if (order.final_total != null) notes.push(formatGELShort(Number(order.final_total)));
      if (order.confirmed_due_date) {
        notes.push(t('orders.dueOn', { date: shortDate(order.confirmed_due_date) }));
      }
    }
    // The hand-over is what the due date is for, so it hangs there until then.
    if (stage === 'SENT_TO_CLINIC' && !reached && due) {
      at = t('orders.dueOn', { date: shortDate(due) });
    }
    if (stage === 'COMPLETED' && complete && order.completed_at) {
      at = shortDateTime(order.completed_at);
    }
    // Once the lab has the case, the stage it is at names who is on it.
    if (i === current && i > 0 && !complete && team) {
      notes.push(t('orderDetail.labCard.team', { names: team }));
    }

    return {
      key: stage,
      // "Received at clinic" sits on the hand-over stage (pipeline.ts) and is
      // named there once the clinic has marked it (0052).
      label:
        stage === 'SENT_TO_CLINIC' && order.status === 'RECEIVED_BY_CLINIC'
          ? statusLabel('RECEIVED_BY_CLINIC', tc)
          : statusLabel(stage, tc),
      icon: PIPELINE_ICONS[stage],
      at,
      note: notes.length ? notes.join(' · ') : undefined,
    };
  });

  return (
    <SectionCard>
      <ProgressSteps
        variant="track"
        steps={steps}
        current={current}
        complete={complete}
        ariaLabel={t('orderDetail.caseProgress')}
      />
      <Box sx={{ mt: 1.25 }}>{history}</Box>
    </SectionCard>
  );
}
