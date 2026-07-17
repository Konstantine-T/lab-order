import { Card, CardActionArea, CardContent, Grid, Stack, Typography } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import AssignmentIcon from '@mui/icons-material/Assignment';
import MailIcon from '@mui/icons-material/Mail';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { ClinicDoctorRow } from '@/types/database';

function StatCard({
  icon,
  value,
  label,
  to,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  to: string;
}) {
  return (
    <Card>
      <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }}>
        <CardContent>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center" color="primary.main">
              {icon}
              <Typography variant="h4" fontWeight={700}>
                {value}
              </Typography>
            </Stack>
            <Typography color="text.secondary">{label}</Typography>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export function ClinicHomePage() {
  const { t } = useTranslation('clinic');
  const { user } = useAuth();
  const clinicId = user?.clinic?.id;
  const clinicName = user?.clinic?.public_name;

  const { data: doctors = [] } = useQuery({
    queryKey: ['clinic-doctors', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('clinic_doctors');
      if (error) throw error;
      return (data ?? []) as ClinicDoctorRow[];
    },
  });

  const { data: orderCount = 0 } = useQuery({
    queryKey: ['clinic-order-count', clinicId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: pendingInvites = 0 } = useQuery({
    queryKey: ['clinic-pending-invites', clinicId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('clinic_doctor_invites')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <Stack spacing={3}>
      <Typography variant="h4">{clinicName || t('home.fallbackName')}</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <StatCard
            icon={<GroupsIcon />}
            value={doctors.length}
            label={t('home.stats.doctors')}
            to="/clinic/doctors"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            icon={<AssignmentIcon />}
            value={orderCount}
            label={t('home.stats.orders')}
            to="/clinic/orders"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            icon={<MailIcon />}
            value={pendingInvites}
            label={t('home.stats.pendingInvites')}
            to="/clinic/doctors"
          />
        </Grid>
      </Grid>
    </Stack>
  );
}
