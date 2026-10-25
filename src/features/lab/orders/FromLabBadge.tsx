import { useTranslation } from 'react-i18next';
import { Icon, StatusPill } from '@/components/design';

/**
 * "From a lab": the customer is another laboratory buying through its buying
 * profile (0048), not a doctor. Neutral, like the other permanent facts about
 * an order (the invoice mark): nothing here is waiting on anyone.
 */
export function FromLabBadge() {
  const { t } = useTranslation('lab');
  return (
    <StatusPill tone="neutral" sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
      <Icon name="science" size={13} />
      {t('customer.fromLab')}
    </StatusPill>
  );
}
