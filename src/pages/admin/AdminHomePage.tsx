import { Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';

export function AdminHomePage() {
  const { t } = useTranslation('admin');

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

  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t('home.title')}</Typography>
      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6">{t('home.pendingLabs')}</Typography>
            <Typography variant="h2" color="primary">
              {pendingCount}
            </Typography>
            <Stack direction="row">
              <Button component={RouterLink} to="/admin/labs" variant="contained">
                {t('home.openQueue')}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
