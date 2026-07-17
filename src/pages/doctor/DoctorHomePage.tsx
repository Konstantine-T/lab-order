import { Card, CardContent, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ClinicInvitesCard } from '@/features/clinic/ClinicInvitesCard';

export function DoctorHomePage() {
  const { t } = useTranslation('doctor');
  const { user } = useAuth();
  return (
    <Stack spacing={3}>
      <Typography variant="h4">
        {t('home.welcome', { name: user ? `${user.first_name} ${user.last_name}` : '' })}
      </Typography>

      <ClinicInvitesCard />

      <Card>
        <CardContent>
          <Typography color="text.secondary">{t('home.comingSoon')}</Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
