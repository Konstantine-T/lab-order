import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function ForbiddenPage() {
  const { t } = useTranslation('common');
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Stack spacing={2} alignItems="center">
        <Typography variant="h2">403</Typography>
        <Typography color="text.secondary">{t('errors.forbidden')}</Typography>
        <Button component={RouterLink} to="/" variant="contained">
          {t('notFound.goHome')}
        </Button>
      </Stack>
    </Box>
  );
}
