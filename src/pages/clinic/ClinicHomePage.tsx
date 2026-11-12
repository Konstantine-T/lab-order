import { Button } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Callout, Icon, PageHeader, StatGrid, StatTile } from '@/components/design';
import type { ClinicDoctorRow } from '@/types/database';
import { clinicReadyForOrders } from '@/features/clinic/clinicOrder';
import { useClinicNavAlerts } from '@/features/notifications/useNavAlerts';

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

  // The nav's query: one count for the badge, the alert and the square.
  const { sentToClinic } = useClinicNavAlerts(clinicId);
  const showSentToClinic = () => navigate('/clinic/orders', { state: { preset: 'sentToClinic' } });

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

      {/* Nobody can order for a clinic until its profile is complete (0058). */}
      {user?.clinic && !clinicReadyForOrders(user.clinic) && (
        <Callout
          tone="warning"
          title={t('home.incompleteTitle')}
          sx={{ mb: 2 }}
          action={
            <Button component={RouterLink} to="/clinic/profile" size="small" variant="outlined">
              {t('home.incompleteCta')}
            </Button>
          }
        >
          {t('home.incompleteBody')}
        </Callout>
      )}

      {/* What the lab has handed over: to mark received, or the lab never
          learns it arrived. The same count as the nav badge (one query). */}
      {sentToClinic > 0 && (
        <Callout
          tone="warning"
          icon="local_shipping"
          sx={{ mb: 2 }}
          action={
            <Button size="small" variant="outlined" onClick={showSentToClinic}>
              {t('home.showOrders')}
            </Button>
          }
        >
          {t('home.sentToClinicAlert', { count: sentToClinic })}
        </Callout>
      )}

      <StatGrid columns={4}>
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
        {/* Counted with the preset its click applies (homePresets), so the
            number is the rows it opens; plain text at 0 (StatTile). */}
        <StatTile
          icon="local_shipping"
          tone={sentToClinic > 0 ? 'warning' : 'neutral'}
          value={sentToClinic}
          label={t('home.stats.sentToClinic')}
          onClick={sentToClinic > 0 ? showSentToClinic : undefined}
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
