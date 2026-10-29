import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { EmptyState, Icon, PageHeader } from '@/components/design';
import { OrderStatusChip } from '@/components/OrderStatusChip';
import { OrderRowCard } from '@/features/orders/OrderRowCard';
import { appendDueWindow, dueTimeOf } from '@/features/orders/orderDates';
import { pastDate, shortDate } from '@/features/orders/list/listFormat';
import { FromLabBadge } from '@/features/lab/orders/FromLabBadge';
import { isLabPurchase } from '@/features/lab/orders/labCustomer';
import { destinationLabelOf } from '@/features/lab/orders/queueFilters';
import {
  fetchLabProjectHead,
  fetchLabProjectOrders,
  isPatientId,
  labProjectKey,
  labProjectOrdersKey,
  projectPatientName,
} from '@/features/lab/projects/projectsApi';
import { formatGEL } from '@/utils/pricing';

/**
 * `/lab/projects/:patientId`: everything this lab has for one patient record,
 * newest first (5XVmpHyN). Just the orders list, per the owner; each row opens
 * the order sheet.
 *
 * "Project not found" covers every way there can be nothing to show: a wrong
 * id, another lab's patient, the lab's own purchase patient (0048), or a
 * patient whose orders here are all in the trash (0050). Both queries filter
 * lab_id and patient_id themselves (see projectsApi), so another lab's data
 * never reaches this page whatever the URL says.
 */
export function LabProjectPage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const { patientId } = useParams<{ patientId: string }>();
  const validId = isPatientId(patientId);
  const navigate = useNavigate();

  const head = useQuery({
    queryKey: labProjectKey(labId, patientId),
    enabled: !!labId && validId,
    queryFn: () => fetchLabProjectHead(labId!, patientId!),
  });

  const orders = useQuery({
    queryKey: labProjectOrdersKey(labId, patientId),
    enabled: !!labId && validId,
    queryFn: () => fetchLabProjectOrders(labId!, patientId!),
  });

  if (validId && (head.isLoading || orders.isLoading)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (validId && (head.isError || orders.isError)) {
    return (
      <>
        <PageHeader backTo="/lab/projects" title={t('projects.title')} />
        <EmptyState icon="error" title={tc('errors.loadFailed')} minHeight={240} />
      </>
    );
  }

  const rows = orders.data ?? [];
  const project = head.data;
  if (!validId || !project || rows.length === 0) {
    return (
      <>
        <PageHeader backTo="/lab/projects" title={t('projects.title')} />
        <EmptyState
          icon="folder_open"
          title={t('projects.notFound')}
          description={t('projects.notFoundBody')}
          minHeight={240}
          action={
            <Button
              component={RouterLink}
              to="/lab/projects"
              variant="outlined"
              size="small"
              startIcon={<Icon name="arrow_back" size={16} />}
            >
              {t('projects.back')}
            </Button>
          }
        />
      </>
    );
  }

  const patientName = project.patients ? projectPatientName(project.patients) : '';
  const ds = project.doctor_snapshot ?? {};
  const doctorName = [ds.first_name?.trim(), ds.last_name?.trim()].filter(Boolean).join(' ');
  const place = destinationLabelOf(project);
  // Who the patient is and who sends their work, from the latest order.
  const facts = [
    project.patients?.date_of_birth
      ? t('orderSheet.patientDob', { date: project.patients.date_of_birth })
      : null,
    doctorName || null,
    [place.clinic, place.detail].filter(Boolean).join(', ') || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const openCount = rows.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;

  return (
    <>
      <PageHeader
        backTo="/lab/projects"
        title={patientName || '—'}
        chips={isLabPurchase(project) ? <FromLabBadge /> : undefined}
        subtitle={
          <>
            {/* The breadcrumb, as the wizard's header draws one: the list
                linked, then this page. */}
            <Box
              component="span"
              role="navigation"
              aria-label={t('projects.breadcrumbA11y')}
              sx={{ display: 'block' }}
            >
              <Box
                component={RouterLink}
                to="/lab/projects"
                sx={{
                  color: 'inherit',
                  textDecoration: 'none',
                  '&:hover': { color: 'text.primary', textDecoration: 'underline' },
                }}
              >
                {t('projects.title')}
              </Box>
              {' / '}
              <span aria-current="page">{patientName || '—'}</span>
            </Box>
            {facts && (
              <Box component="span" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                {facts}
              </Box>
            )}
          </>
        }
      />

      <Stack spacing={1.25}>
        <Typography variant="body2" color="text.secondary">
          {[
            t('projects.orders', { count: rows.length }),
            openCount > 0 ? t('projects.open', { count: openCount }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
        {rows.map((row) => {
          const serviceName = row.lab_services?.name ?? row.service_snapshot?.name ?? '';
          const dueRaw = row.confirmed_due_date ?? row.requested_due_date;
          return (
            <OrderRowCard
              key={row.id}
              code={row.order_code}
              primary={serviceName || '—'}
              status={<OrderStatusChip status={row.status} />}
              total={row.final_total != null ? formatGEL(row.final_total) : '—'}
              createdDate={pastDate(row.created_at, tc)}
              dueDate={dueRaw ? appendDueWindow(shortDate(dueRaw, tc), dueTimeOf(row), tc) : '—'}
              avatarText={serviceName || '?'}
              onClick={() => navigate(`/lab/orders/${row.id}`)}
            />
          );
        })}
      </Stack>
    </>
  );
}
