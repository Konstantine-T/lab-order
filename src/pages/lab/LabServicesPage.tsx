import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DescriptionIcon from '@mui/icons-material/Description';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { LabFormRow, LabServiceRow } from '@/types/database';

type ServiceWithForm = LabServiceRow & {
  lab_forms: Pick<LabFormRow, 'id' | 'status' | 'title'> | null;
};

export function LabServicesPage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const labId = user?.lab?.id;

  const { data: services = [], isLoading, error } = useQuery({
    queryKey: ['lab-services-with-forms', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_services')
        .select(
          'id, lab_id, name, short_description, average_turnaround_days, average_turnaround_label, cover_image_url, linked_lab_form_id, service_phase_type, is_active, sort_order, created_at, updated_at, ' +
            'lab_forms!lab_services_linked_form_fk(id, status, title)',
        )
        .eq('lab_id', labId!)
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as ServiceWithForm[];
    },
  });

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <Stack>
          <Typography variant="h4">{t('services.title')}</Typography>
          <Typography color="text.secondary">{t('services.subtitle')}</Typography>
        </Stack>
        <Box>
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            component={RouterLink}
            to="/lab/services/new"
          >
            {t('services.addNew')}
          </Button>
        </Box>
      </Stack>

      {error && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : services.length === 0 ? (
        <Card>
          <CardContent>
            <Stack spacing={2} alignItems="flex-start">
              <Typography color="text.secondary">{t('services.empty')}</Typography>
              <Button
                startIcon={<AddIcon />}
                variant="contained"
                component={RouterLink}
                to="/lab/services/new"
              >
                {t('services.addNew')}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {services.map((s) => {
            const formStatus = s.lab_forms?.status ?? null;
            const formPublished = formStatus === 'PUBLISHED';
            const orderable = s.is_active && formPublished;
            return (
              <Grid key={s.id} item xs={12} sm={6} md={4}>
                <Card>
                  <CardActionArea component={RouterLink} to={`/lab/services/${s.id}`}>
                    <CardContent>
                      <Stack direction="row" spacing={2} alignItems="flex-start">
                        <Avatar
                          src={s.cover_image_url ?? undefined}
                          variant="rounded"
                          sx={{ width: 48, height: 48 }}
                        >
                          <DescriptionIcon />
                        </Avatar>
                        <Stack flex={1} spacing={1} sx={{ minWidth: 0 }}>
                          <Typography variant="h6" noWrap>
                            {s.name}
                          </Typography>
                          {s.short_description && (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {s.short_description}
                            </Typography>
                          )}
                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            <Chip
                              size="small"
                              label={
                                s.is_active ? t('services.active') : t('services.inactive')
                              }
                              color={s.is_active ? 'success' : 'default'}
                            />
                            {formStatus && (
                              <Chip
                                size="small"
                                variant="outlined"
                                color={formPublished ? 'success' : 'default'}
                                label={
                                  formPublished
                                    ? t('services.formPublished')
                                    : t('services.formDraft')
                                }
                              />
                            )}
                            {!formStatus && (
                              <Chip
                                size="small"
                                variant="outlined"
                                color="warning"
                                label={t('services.noLinkedForm')}
                              />
                            )}
                            {orderable && (
                              <Chip
                                size="small"
                                color="primary"
                                label={t('services.orderable')}
                              />
                            )}
                          </Stack>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Stack>
  );
}
