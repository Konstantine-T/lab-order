import { Button } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Icon, PageHeader, StatGrid, StatTile } from '@/components/design';
import type { ClinicDoctorRow } from '@/types/database';

export function ClinicHomePage() {
  const { t } = useTranslation('clinic');
  const { user } = useAuth();
  const navigate = useNavigate();
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
    <>
      <PageHeader
        size="h3"
        title={clinicName || t('home.fallbackName')}
        subtitle={t('home.subtitle')}
        actions={
          <Button
            component={RouterLink}
            to="/clinic/orders/new"
            variant="contained"
            startIcon={<Icon name="add" size={17} />}
          >
            {t('orders.newOrder')}
          </Button>
        }
      />

      <StatGrid columns={3}>
        <StatTile
          icon="groups"
          tone="brand"
          value={doctors.length}
          label={t('home.stats.doctors')}
          onClick={() => navigate('/clinic/doctors')}
        />
        <StatTile
          icon="receipt_long"
          tone="success"
          value={orderCount}
          label={t('home.stats.orders')}
          onClick={() => navigate('/clinic/orders')}
        />
        <StatTile
          icon="mail"
          tone="warning"
          value={pendingInvites}
          label={t('home.stats.pendingInvites')}
          onClick={() => navigate('/clinic/doctors')}
        />
      </StatGrid>
    </>
  );
}
