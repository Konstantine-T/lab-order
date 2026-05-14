import { Alert, AlertTitle, Box, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { LabApprovalStatus } from '@/types/database';

const STATUS_TO_SEVERITY: Record<LabApprovalStatus, 'info' | 'warning' | 'success' | 'error'> = {
  PENDING_APPROVAL: 'info',
  CHANGES_REQUESTED: 'warning',
  APPROVED_ACTIVE: 'success',
  REJECTED: 'error',
  SUSPENDED: 'error',
};

export function LabApprovalBanner({
  status,
  note,
}: {
  status: LabApprovalStatus;
  note?: string | null;
}) {
  const { t } = useTranslation('lab');
  if (status === 'APPROVED_ACTIVE') return null;

  const severity = STATUS_TO_SEVERITY[status];
  const title = t(`approvalBanner.${status}.title` as const);
  const body = t(`approvalBanner.${status}.body` as const);

  return (
    <Alert severity={severity}>
      <AlertTitle>{title}</AlertTitle>
      <Stack spacing={1}>
        <Typography variant="body2">{body}</Typography>
        {note && status === 'CHANGES_REQUESTED' && (
          <Box sx={{ p: 1.5, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {note}
            </Typography>
          </Box>
        )}
      </Stack>
    </Alert>
  );
}
