import { Button } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import {
  CardStack,
  Icon,
  PageHeader,
  StatCard,
  StatGrid,
} from '@/components/design';

export function AdminHomePage() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['admin-pending-labs-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('labs')
        .select('*', { count: 'exact', head: true })
        .in('approval_status', ['PENDING_APPROVAL', 'CHANGES_REQUESTED']);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: activeCount = 0 } = useQuery({
    queryKey: ['admin-active-labs-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('labs')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'APPROVED_ACTIVE');
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: feedbackCount = 0 } = useQuery({
    queryKey: ['admin-feedback-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('feedback')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <>
      <PageHeader
        size="h3"
        title={t('home.title')}
        actions={
          <Button
            component={RouterLink}
            to="/admin/labs"
            variant="contained"
            endIcon={<Icon name="arrow_forward" size={16} />}
          >
            {t('home.openQueue')}
          </Button>
        }
      />

      <CardStack>
        <StatGrid columns={3}>
          <StatCard
            dotColor="#F59E0B"
            label={t('home.pendingLabs')}
            value={pendingCount}
            caption={t('home.pendingCaption')}
          />
          <StatCard
            dotColor="#16A34A"
            label={t('home.activeLabs')}
            value={activeCount}
            caption={t('home.activeCaption')}
          />
          <StatCard
            dotColor="#9292FF"
            label={t('feedbacks.title')}
            value={feedbackCount}
            caption={t('home.feedbackCaption')}
          />
        </StatGrid>

        <StatGrid columns={2}>
          <Button
            variant="outlined"
            size="large"
            startIcon={<Icon name="admin_panel_settings" size={18} />}
            onClick={() => navigate('/admin/labs')}
            sx={{ justifyContent: 'flex-start', py: 2 }}
          >
            {t('labs.queueTitle')}
          </Button>
          <Button
            variant="outlined"
            size="large"
            startIcon={<Icon name="feedback" size={18} />}
            onClick={() => navigate('/admin/feedbacks')}
            sx={{ justifyContent: 'flex-start', py: 2 }}
          >
            {t('feedbacks.title')}
          </Button>
        </StatGrid>
      </CardStack>
    </>
  );
}
