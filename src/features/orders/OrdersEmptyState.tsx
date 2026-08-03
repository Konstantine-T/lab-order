import type { ReactNode } from 'react';
import { EmptyState } from '@/components/design';

type Props = {
  title: string;
  body?: string;
  action?: ReactNode;
  /** Material Symbols name for the bubble. */
  icon?: string;
};

/** The dashed empty panel for an orders list, in the redesign's house style. */
export function OrdersEmptyState({ title, body, action, icon = 'inbox' }: Props) {
  return (
    <EmptyState icon={icon} title={title} description={body} action={action} minHeight={240} />
  );
}
