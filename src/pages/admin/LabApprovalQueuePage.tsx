import { useMemo, useState } from 'react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { LabStatusChip } from '@/components/LabStatusChip';
import {
  ChoicePill,
  type Column,
  DataRow,
  DataTable,
  EmptyState,
  Icon,
  InitialsAvatar,
  PageHeader,
  PillRow,
} from '@/components/design';
import type { LabApprovalStatus, LabRow } from '@/types/database';

type FilterValue = 'ALL' | LabApprovalStatus;

const FILTERS: { value: FilterValue; labelKey: string }[] = [
  { value: 'ALL', labelKey: 'labs.filters.all' },
  { value: 'PENDING_APPROVAL', labelKey: 'labs.filters.pending' },
  { value: 'CHANGES_REQUESTED', labelKey: 'labs.filters.changesRequested' },
  { value: 'APPROVED_ACTIVE', labelKey: 'labs.filters.approved' },
  { value: 'REJECTED', labelKey: 'labs.filters.rejected' },
  { value: 'SUSPENDED', labelKey: 'labs.filters.suspended' },
];

const COLUMNS: Column[] = [
  { key: 'publicName', width: 'minmax(0, 1.4fr)' },
  { key: 'legalName', width: 'minmax(0, 1.2fr)' },
  { key: 'city', width: '120px' },
  { key: 'contactEmail', width: 'minmax(0, 1.3fr)' },
  { key: 'status', width: '150px' },
  { key: 'submittedAt', width: '110px' },
];

export function LabApprovalQueuePage() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterValue>('PENDING_APPROVAL');

  const { data: labs = [], isLoading } = useQuery({
    queryKey: ['admin-labs', filter],
    queryFn: async () => {
      let q = supabase.from('labs').select('*').order('created_at', { ascending: false });
      if (filter !== 'ALL') q = q.eq('approval_status', filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LabRow[];
    },
  });

  const columns = useMemo(
    () => COLUMNS.map((c) => ({ ...c, label: t(`labs.columns.${c.key}` as const) })),
    [t],
  );

  return (
    <>
      <PageHeader title={t('labs.queueTitle')} subtitle={t('labs.queueSubtitle')} />

      <Stack spacing={2}>
        <PillRow>
          {FILTERS.map((f) => (
            <ChoicePill key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
              {t(f.labelKey)}
            </ChoicePill>
          ))}
        </PillRow>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : labs.length === 0 ? (
          <EmptyState icon="verified" title={t('labs.empty')} minHeight={220} />
        ) : (
          <DataTable columns={columns} minWidth={900}>
            {labs.map((lab) => (
              <DataRow
                key={lab.id}
                columns={COLUMNS}
                onClick={() => navigate(`/admin/labs/${lab.id}`)}
              >
                <Stack direction="row" alignItems="center" spacing={1.125} sx={{ minWidth: 0 }}>
                  <InitialsAvatar name={lab.public_name || '?'} size={28} shape="circle" />
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }} noWrap>
                    {lab.public_name}
                  </Typography>
                </Stack>
                <Typography variant="body1" color="text.secondary" noWrap>
                  {lab.legal_name ?? '—'}
                </Typography>
                <Typography variant="body1" color="text.secondary" noWrap>
                  {lab.city ?? '—'}
                </Typography>
                <Typography variant="body1" color="text.secondary" noWrap>
                  {lab.contact_email ?? '—'}
                </Typography>
                <LabStatusChip status={lab.approval_status} />
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {lab.created_at ? dayjs(lab.created_at).format('YYYY-MM-DD') : '—'}
                  </Typography>
                  <Icon name="chevron_right" size={16} sx={{ color: 'text.disabled' }} />
                </Stack>
              </DataRow>
            ))}
          </DataTable>
        )}
      </Stack>
    </>
  );
}
