import { Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { LabApprovalBanner } from '@/features/lab/LabApprovalBanner';

export function LabDashboardPage() {
  const { t } = useTranslation('lab');
  const { user } = useAuth();
  const lab = user?.lab;
  const labId = lab?.id;
  const navigate = useNavigate();

  const today = dayjs().format('YYYY-MM-DD');
  const dayPlus2 = dayjs().add(2, 'day').format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

  const { data: openCount = 0 } = useQuery({
    queryKey: ['lab-open-orders-count', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('lab_id', labId!)
        .not('status', 'in', '(COMPLETED,CANCELLED)');
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: dueDates = [] } = useQuery({
    queryKey: ['lab-orders-due-dates', labId],
    enabled: !!labId && lab?.approval_status === 'APPROVED_ACTIVE',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('confirmed_due_date, requested_due_date')
        .eq('lab_id', labId!)
        .not('status', 'in', '(COMPLETED,CANCELLED)');
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.confirmed_due_date ?? r.requested_due_date)
        .filter(Boolean) as string[];
    },
  });

  const overdueCount = dueDates.filter((d) => d < today).length;
  const dueSoonCount = dueDates.filter((d) => d >= today && d <= dayPlus2).length;

  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t('dashboard.title')}</Typography>
      {lab && <LabApprovalBanner status={lab.approval_status} note={lab.approval_note} />}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">
              {t('dashboard.welcome', { name: user ? `${user.first_name} ${user.last_name}` : '' })}
            </Typography>
            {lab?.approval_status === 'APPROVED_ACTIVE' ? (
              <Stack spacing={2}>
                <Stack spacing={1}>
                  <Typography variant="overline" color="text.secondary">
                    {t('dashboard.openOrders')}
                  </Typography>
                  <Typography variant="h2" color="primary">
                    {openCount}
                  </Typography>
                  <Stack direction="row">
                    <Button component={RouterLink} to="/lab/orders" variant="contained">
                      {t('dashboard.viewOrders')}
                    </Button>
                  </Stack>
                </Stack>

                {(overdueCount > 0 || dueSoonCount > 0) && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    {overdueCount > 0 && (
                      <Card
                        variant="outlined"
                        sx={{
                          flex: 1,
                          borderColor: 'error.main',
                          cursor: 'pointer',
                          transition: 'box-shadow 0.15s',
                          '&:hover': { boxShadow: 3 },
                        }}
                        onClick={() =>
                          navigate('/lab/orders', { state: { dueTo: yesterday } })
                        }
                      >
                        <CardContent>
                          <Typography variant="overline" color="error.main">
                            {t('dashboard.overdue')}
                          </Typography>
                          <Typography variant="h3" color="error.main">
                            {overdueCount}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {t('dashboard.overdueHint')}
                          </Typography>
                        </CardContent>
                      </Card>
                    )}
                    {dueSoonCount > 0 && (
                      <Card
                        variant="outlined"
                        sx={{
                          flex: 1,
                          borderColor: 'warning.main',
                          cursor: 'pointer',
                          transition: 'box-shadow 0.15s',
                          '&:hover': { boxShadow: 3 },
                        }}
                        onClick={() =>
                          navigate('/lab/orders', { state: { dueFrom: today, dueTo: dayPlus2 } })
                        }
                      >
                        <CardContent>
                          <Typography variant="overline" color="warning.dark">
                            {t('dashboard.dueSoon')}
                          </Typography>
                          <Typography variant="h3" color="warning.dark">
                            {dueSoonCount}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {t('dashboard.dueSoonHint')}
                          </Typography>
                        </CardContent>
                      </Card>
                    )}
                  </Stack>
                )}
              </Stack>
            ) : (
              <Typography color="text.secondary">{t('dashboard.comingSoon')}</Typography>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
