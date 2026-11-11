import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { EmptyState, Icon, PageHeader } from '@/components/design';
import { OrderCard } from '@/features/orders/list/OrderCard';
import { OrderCardGrid, OrderListTable } from '@/features/orders/list/view/OrderListTable';
import {
  labCustomerName,
  labListColumns,
  labListRow,
} from '@/features/orders/list/view/listRows';
import { LabRowBadges } from '@/features/orders/list/view/RowBadges';
import { OrdersViewToggle } from '@/features/orders/list/view/OrdersViewToggle';
import { useOrdersView } from '@/features/orders/list/view/useOrdersView';
import { useInvoiceOrderIds } from '@/features/orders/orderFiles/useInvoiceOrderIds';
import { useParentOrderCodes } from '@/features/orders/useParentOrderCodes';
import { isAnswered, labCardRow } from '@/features/lab/orders/labOrderList';
import { queueDates } from '@/features/lab/orders/orderPresets';
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

/**
 * `/lab/projects/:patientId`: everything this lab has for one patient record,
 * newest first (5XVmpHyN). Just the orders list, per the owner; each row opens
 * the order sheet.
 *
 * "Project not found" covers every way there can be nothing to show: a wrong
 * id, another lab's patient, the lab's own purchase patient (0048), or a
 * patient whose orders here are all in the trash (0054). Both queries filter
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

  // List or cards, per person. Hooks before the early returns below.
  const { view, setView, canSwitch } = useOrdersView('lab-project');
  const parentCodes = useParentOrderCodes(orders.data ?? []);
  const invoicedIds = useInvoiceOrderIds({ labId, unacknowledgedOnly: false, enabled: !!labId });

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

  const patientName = projectPatientName(project);
  const ds = project.doctor_snapshot ?? {};
  const doctorName = [ds.first_name?.trim(), ds.last_name?.trim()].filter(Boolean).join(' ');
  const place = destinationLabelOf(project);
  // Who the patient is and who sends their work, from the latest order.
  const facts = [
    project.patient_birth_year
      ? t('orderSheet.patientBorn', { year: project.patient_birth_year })
      : null,
    doctorName || null,
    [place.clinic, place.detail].filter(Boolean).join(', ') || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const rowDates = queueDates();
  const openCount = rows.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;

  return (
    <>
      <PageHeader
        backTo="/lab/projects"
        title={patientName || '—'}
        chips={isLabPurchase(project) ? <FromLabBadge /> : undefined}
        actions={<OrdersViewToggle view={view} onChange={setView} canSwitch={canSwitch} />}
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
        {view === 'list' ? (
          <OrderListTable
            columns={labListColumns({ t: tc })}
            rows={rows.map((row) =>
              labListRow(row, {
                dates: rowDates,
                invoiced: invoicedIds.has(row.id),
                onOpen: () => navigate(`/lab/orders/${row.id}`),
                lineage: { parentCode: parentCodes.get(row.continues_order_id ?? '') },
              }),
            )}
          />
        ) : (
          <OrderCardGrid>
            {rows.map((row) => (
              <OrderCard
                key={row.id}
                row={labCardRow(row)}
                perspective="lab"
                customer={{ name: labCustomerName(row), fromLab: isLabPurchase(row) }}
                highlight={row.has_unreviewed_edits || isAnswered(row)}
                extraBadges={<LabRowBadges row={row} invoiced={invoicedIds.has(row.id)} />}
                parentCode={parentCodes.get(row.continues_order_id ?? '')}
                href={`/lab/orders/${row.id}`}
              />
            ))}
          </OrderCardGrid>
        )}
      </Stack>
    </>
  );
}
