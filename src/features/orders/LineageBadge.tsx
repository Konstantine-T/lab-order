import { useTranslation } from 'react-i18next';
import { Icon, StatusPill } from '@/components/design';

/**
 * "Continues from ORD-1042" on a list row.
 *
 * Not a link. The card is already one button; a nested anchor would need
 * stopPropagation and would put two different click targets in one row.
 * Clicking the card opens the order, where the full trail is clickable.
 *
 * Renders nothing for an order that continues nothing — and, when the parent
 * couldn't be resolved, still renders, without the code. That an order IS a
 * continuation is the useful signal; the code is the detail, and hiding the
 * badge would be a silent lie about what the order is.
 */
export function LineageBadge({
  continuesOrderId,
  parentCode,
}: {
  continuesOrderId: string | null | undefined;
  parentCode: string | undefined;
}) {
  const { t } = useTranslation('common');
  if (!continuesOrderId) return null;

  const label = parentCode
    ? `${t('orderCard.continuesFrom')} ${parentCode}`
    : t('orderCard.continuation');

  return (
    <StatusPill tone="brand" sx={{ flexShrink: 0 }}>
      <Icon name="repeat" size={13} />
      <span title={label}>{label}</span>
    </StatusPill>
  );
}
