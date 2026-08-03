import { useTranslation } from 'react-i18next';
import { StatusPill } from '@/components/design/StatusPill';
import type { Tone } from '@/theme/tokens';
import type { LabApprovalStatus } from '@/types/database';

const TONES: Record<LabApprovalStatus, Tone> = {
  PENDING_APPROVAL: 'warning',
  CHANGES_REQUESTED: 'warning',
  APPROVED_ACTIVE: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'neutral',
};

export function LabStatusChip({ status }: { status: LabApprovalStatus }) {
  const { t } = useTranslation('common');
  return <StatusPill tone={TONES[status]}>{t(`labApprovalStatus.${status}`)}</StatusPill>;
}
