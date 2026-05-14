import { Chip, type ChipProps } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { LabApprovalStatus } from '@/types/database';

const COLORS: Record<LabApprovalStatus, ChipProps['color']> = {
  PENDING_APPROVAL: 'warning',
  CHANGES_REQUESTED: 'info',
  APPROVED_ACTIVE: 'success',
  REJECTED: 'error',
  SUSPENDED: 'default',
};

export function LabStatusChip({ status }: { status: LabApprovalStatus }) {
  const { t } = useTranslation('common');
  return <Chip size="small" color={COLORS[status]} label={t(`labApprovalStatus.${status}`)} />;
}
