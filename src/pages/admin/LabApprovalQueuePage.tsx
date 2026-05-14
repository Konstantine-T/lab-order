import { useMemo, useState } from 'react';
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { LabStatusChip } from '@/components/LabStatusChip';
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

export function LabApprovalQueuePage() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterValue>('PENDING_APPROVAL');

  const { data: labs = [], isLoading } = useQuery({
    queryKey: ['admin-labs', filter],
    queryFn: async () => {
      let q = supabase
        .from('labs')
        .select('*')
        .order('created_at', { ascending: false });
      if (filter !== 'ALL') q = q.eq('approval_status', filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LabRow[];
    },
  });

  const columns = useMemo<GridColDef<LabRow>[]>(
    () => [
      { field: 'public_name', headerName: t('labs.columns.publicName'), flex: 1, minWidth: 180 },
      { field: 'legal_name', headerName: t('labs.columns.legalName'), flex: 1, minWidth: 180 },
      { field: 'city', headerName: t('labs.columns.city'), width: 140 },
      { field: 'contact_email', headerName: t('labs.columns.contactEmail'), flex: 1, minWidth: 200 },
      {
        field: 'approval_status',
        headerName: t('labs.columns.status'),
        width: 180,
        renderCell: ({ row }) => <LabStatusChip status={row.approval_status} />,
      },
      {
        field: 'created_at',
        headerName: t('labs.columns.submittedAt'),
        width: 160,
        valueFormatter: (value) => (value ? dayjs(value as string).format('YYYY-MM-DD') : ''),
      },
    ],
    [t],
  );

  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t('labs.queueTitle')}</Typography>

      <Tabs
        value={filter}
        onChange={(_, v: FilterValue) => setFilter(v)}
        variant="scrollable"
        scrollButtons="auto"
      >
        {FILTERS.map((f) => (
          <Tab key={f.value} label={t(f.labelKey)} value={f.value} />
        ))}
      </Tabs>

      <Box sx={{ height: 600, width: '100%' }}>
        <DataGrid<LabRow>
          rows={labs}
          columns={columns}
          loading={isLoading}
          disableRowSelectionOnClick
          onRowClick={(params) => navigate(`/admin/labs/${params.id}`)}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          pageSizeOptions={[25, 50, 100]}
        />
      </Box>
    </Stack>
  );
}
