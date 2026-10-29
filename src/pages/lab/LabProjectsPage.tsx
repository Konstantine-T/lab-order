import { useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import {
  type Column,
  DataRow,
  DataTable,
  EmptyState,
  Icon,
  InitialsAvatar,
  PageHeader,
  Pager,
  SectionCard,
} from '@/components/design';
import { OrderStatusChip } from '@/components/OrderStatusChip';
import { pastDate } from '@/features/orders/list/listFormat';
import { FromLabBadge } from '@/features/lab/orders/FromLabBadge';
import {
  fetchLabProjects,
  labProjectsKey,
  PROJECTS_PAGE_SIZE,
  projectClinicLine,
  projectPatientName,
} from '@/features/lab/projects/projectsApi';
import type { LabProjectRow } from '@/types/database';

const COLUMNS: Column[] = [
  { key: 'patient', width: 'minmax(0, 1.3fr)' },
  { key: 'doctor', width: 'minmax(0, 1.2fr)' },
  { key: 'orders', width: '120px' },
  { key: 'lastOrder', width: '200px' },
  { key: 'go', width: '24px' },
];

/** How long the search waits for the typing to stop, as the spec asks. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * `/lab/projects`: one row per patient record this lab has orders for
 * (5XVmpHyN). Grouped, searched and paged by `lab_projects` (0055), so the
 * page count is of projects, not orders.
 */
export function LabProjectsPage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const navigate = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));

  const [search, setSearch] = useState('');
  // What the query runs with: the search once typing stops, tidied the way the
  // server compares it, so a trailing space does not refetch or reset the page.
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const next = search.trim().replace(/\s+/g, ' ');
    if (next === query) return;
    const id = setTimeout(() => {
      setQuery(next);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search, query]);

  const { data, isLoading, isError, isPlaceholderData } = useQuery({
    queryKey: labProjectsKey(labId, query, page),
    enabled: !!labId,
    queryFn: () => fetchLabProjects(query, page),
    // The rows stay on screen while the next page or search loads.
    placeholderData: keepPreviousData,
  });

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PROJECTS_PAGE_SIZE));

  // A page that emptied under the lab (orders trashed, or a live refetch):
  // back to the first page rather than an empty list with no pager.
  useEffect(() => {
    if (!isPlaceholderData && data && data.length === 0 && page > 1) setPage(1);
  }, [data, isPlaceholderData, page]);

  const open = (row: LabProjectRow) => navigate(`/lab/projects/${row.patient_id}`);

  const footer = (
    <>
      <Typography variant="body2" color="text.secondary">
        {tc('pagination.showing', {
          from: (page - 1) * PROJECTS_PAGE_SIZE + 1,
          to: (page - 1) * PROJECTS_PAGE_SIZE + rows.length,
          total,
        })}
      </Typography>
      <Box sx={{ ml: 'auto' }}>
        <Pager page={page - 1} pageCount={pageCount} onChange={(p) => setPage(p + 1)} />
      </Box>
    </>
  );

  return (
    <>
      <PageHeader
        title={t('projects.title')}
        subtitle={t('projects.subtitle')}
        actions={
          <TextField
            placeholder={t('projects.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ width: { sm: 300 } }}
            inputProps={{ 'aria-label': t('projects.search') }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Icon name="search" size={18} sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
          />
        }
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <EmptyState icon="error" title={tc('errors.loadFailed')} minHeight={240} />
      ) : rows.length === 0 ? (
        query ? (
          <EmptyState icon="search_off" title={t('projects.noResults')} minHeight={240} />
        ) : (
          <EmptyState
            icon="folder_open"
            title={t('projects.empty')}
            description={t('projects.emptyBody')}
            minHeight={240}
          />
        )
      ) : phone ? (
        <Stack spacing={1.5}>
          <SectionCard dense>
            {rows.map((row, i) => (
              <ProjectCard key={row.patient_id} row={row} first={i === 0} onOpen={() => open(row)} />
            ))}
          </SectionCard>
          {/* Wraps: the count and five page buttons do not fit one line at
              phone width. */}
          <Stack
            direction="row"
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ columnGap: 1.5, rowGap: 1, px: 0.5 }}
          >
            {footer}
          </Stack>
        </Stack>
      ) : (
        <DataTable
          columns={COLUMNS.map((c) =>
            c.key === 'go' ? c : { ...c, label: t(`projects.columns.${c.key}`) },
          )}
          minWidth={720}
          footer={footer}
        >
          {rows.map((row) => (
            <DataRow key={row.patient_id} columns={COLUMNS} onClick={() => open(row)}>
              <PatientCell row={row} />
              <DoctorCell row={row} />
              <CountsCell row={row} />
              {/* The date over the pill: a Georgian status runs to ~250px,
                  and side by side the two would squeeze each other. */}
              <Stack alignItems="flex-start" spacing={0.5} sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }} noWrap>
                  {pastDate(row.last_order_at, tc)}
                </Typography>
                <OrderStatusChip status={row.last_status} />
              </Stack>
              <Icon name="chevron_right" size={17} sx={{ color: 'text.disabled' }} />
            </DataRow>
          ))}
        </DataTable>
      )}
    </>
  );
}

/** The patient's name, and the date of birth that tells two namesakes apart. */
function PatientCell({ row }: { row: LabProjectRow }) {
  const { t } = useTranslation('lab');
  const name = projectPatientName(row) || '—';
  return (
    <Stack direction="row" alignItems="center" spacing={1.125} sx={{ minWidth: 0 }}>
      <InitialsAvatar name={name} size={28} shape="circle" />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }} noWrap>
          {name}
        </Typography>
        {row.date_of_birth && (
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }} noWrap>
            {t('orderSheet.patientDob', { date: row.date_of_birth })}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

/** The latest order's doctor (or buying lab), with its clinic and branch. */
function DoctorCell({ row }: { row: LabProjectRow }) {
  const clinic = projectClinicLine(row.clinic_name, row.branch_name);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body1" color="text.secondary" noWrap>
        {row.doctor_name || '—'}
      </Typography>
      {row.from_lab && (
        <Box sx={{ mt: 0.375 }}>
          <FromLabBadge />
        </Box>
      )}
      {clinic && (
        <Typography
          sx={{ fontSize: '0.6875rem', color: 'text.secondary', opacity: 0.8 }}
          noWrap
          title={[clinic, row.city].filter(Boolean).join(' · ')}
        >
          {clinic}
        </Typography>
      )}
    </Box>
  );
}

/** "5 orders", and "2 open" under it when some are still in the works. */
function CountsCell({ row }: { row: LabProjectRow }) {
  const { t } = useTranslation('lab');
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }} noWrap>
        {t('projects.orders', { count: row.order_count })}
      </Typography>
      {row.open_count > 0 && (
        <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: 'primary.dark' }} noWrap>
          {t('projects.open', { count: row.open_count })}
        </Typography>
      )}
    </Box>
  );
}

/** A project on a phone: the same facts, stacked. */
function ProjectCard({
  row,
  first,
  onOpen,
}: {
  row: LabProjectRow;
  first: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const name = projectPatientName(row) || '—';
  const clinic = projectClinicLine(row.clinic_name, row.branch_name);
  const counts = [
    t('projects.orders', { count: row.order_count }),
    row.open_count > 0 ? t('projects.open', { count: row.open_count }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Stack
      direction="row"
      spacing={1.5}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      sx={{
        px: 2,
        py: 1.5,
        cursor: 'pointer',
        borderTop: first ? 0 : 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <InitialsAvatar name={name} size={36} shape="circle" />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, overflowWrap: 'anywhere' }}>
          {name}
        </Typography>
        {row.date_of_birth && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {t('orderSheet.patientDob', { date: row.date_of_birth })}
          </Typography>
        )}
        <Stack
          direction="row"
          alignItems="center"
          sx={{ flexWrap: 'wrap', columnGap: 0.75, rowGap: 0.5, mt: 0.5 }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {[row.doctor_name || '—', clinic].filter(Boolean).join(' · ')}
          </Typography>
          {row.from_lab && <FromLabBadge />}
        </Stack>
        <Stack
          direction="row"
          alignItems="center"
          sx={{ flexWrap: 'wrap', columnGap: 1, rowGap: 0.75, mt: 1 }}
        >
          <Typography sx={{ fontSize: '0.78125rem', fontWeight: 600 }}>{counts}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('projects.lastOrderOn', { date: pastDate(row.last_order_at, tc) })}
          </Typography>
          <OrderStatusChip status={row.last_status} />
        </Stack>
      </Box>
      <Icon name="chevron_right" size={17} sx={{ color: 'text.disabled', alignSelf: 'center' }} />
    </Stack>
  );
}
