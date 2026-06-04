import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import ConstructionIcon from '@mui/icons-material/Construction';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Placeholder for routes whose UI hasn't been built yet. Linked from the
// sidebar so users see the upcoming feature in nav — but instead of a 404
// they land here. featureKey reads a specific i18n subkey under
// underDevelopment.features.<key> so the page can name the feature.
export function UnderDevelopmentPage({ featureKey }: { featureKey?: string }) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();

  const featureLabel = featureKey
    ? t(`underDevelopment.features.${featureKey}`, { defaultValue: '' })
    : '';

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: { xs: 4, md: 8 } }}>
      <Card sx={{ maxWidth: 520, width: '100%' }}>
        <CardContent>
          <Stack spacing={2} alignItems="center" sx={{ textAlign: 'center', py: 2 }}>
            <ConstructionIcon sx={{ fontSize: 56, color: 'primary.main' }} />
            <Typography variant="h5">
              {featureLabel || t('underDevelopment.title')}
            </Typography>
            <Typography color="text.secondary">
              {t('underDevelopment.body')}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
              <Button variant="outlined" onClick={() => navigate(-1)}>
                {t('underDevelopment.goBack')}
              </Button>
              <Button component={RouterLink} to="/" variant="contained">
                {t('underDevelopment.goHome')}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
