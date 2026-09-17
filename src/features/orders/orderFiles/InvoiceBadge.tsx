import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { StatusPill } from '@/components/design/StatusPill';

/**
 * "New invoice" on an order card, so the doctor sees it without opening
 * anything — the same reason the lineage badge exists.
 *
 * Warning-toned rather than brand: this is something to go and deal with, not
 * a neutral fact about the order like its lineage.
 */
export function InvoiceBadge() {
  const { t } = useTranslation('common');
  return (
    <StatusPill tone="warning">
      <Icon name="receipt_long" size={13} />
      {t('orderFiles.invoice.badge')}
    </StatusPill>
  );
}
