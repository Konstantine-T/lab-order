import { Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PublicAuthLayout } from '@/layouts/PublicAuthLayout';
import { Icon } from '@/components/design';

export function NotFoundPage() {
  const { t } = useTranslation('common');
  return (
    <PublicAuthLayout maxWidth="xs">
      <Stack spacing={1.5} alignItems="center" sx={{ textAlign: 'center', py: 2 }}>
        <Icon name="search_off" size={44} sx={{ color: 'primary.main' }} />
        <Typography variant="h1">404</Typography>
        <Typography variant="h5">{t('notFound.title')}</Typography>
        <Typography variant="body1" color="text.secondary">
          {t('notFound.body')}
        </Typography>
        <Button component={RouterLink} to="/" variant="contained" sx={{ mt: 1 }}>
          {t('notFound.goHome')}
        </Button>
      </Stack>
    </PublicAuthLayout>
  );
}
