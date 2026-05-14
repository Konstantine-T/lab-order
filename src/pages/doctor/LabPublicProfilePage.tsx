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
import BusinessIcon from '@mui/icons-material/Business';
import { Link as RouterLink, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import type { LabFormRow, LabRow, LabServiceRow } from '@/types/database';

export function LabPublicProfilePage() {
  const { labId } = useParams<{ labId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();

  const { data: lab, isLoading: labLoading } = useQuery({
    queryKey: ['public-lab', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labs')
        .select('id, public_name, city, short_description, logo_url, contact_phone, contact_email, working_address')
        .eq('id', labId!)
        .eq('approval_status', 'APPROVED_ACTIVE')
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data as
        | (Pick<LabRow,
            'id' | 'public_name' | 'city' | 'short_description' | 'logo_url' |
            'contact_phone' | 'contact_email' | 'working_address'
          >)
        | null;
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ['public-lab-services', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_services')
        .select('*')
        .eq('lab_id', labId!)
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as LabServiceRow[];
    },
  });

  const linkedFormIds = services
    .map((s) => s.linked_lab_form_id)
    .filter((x): x is string => !!x);

  const { data: forms = [] } = useQuery({
    queryKey: ['public-lab-forms', labId, linkedFormIds.join(',')],
    enabled: linkedFormIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_forms')
        .select('*')
        .in('id', linkedFormIds);
      if (error) throw error;
      return (data ?? []) as LabFormRow[];
    },
  });

  const formsById = new Map(forms.map((f) => [f.id, f]));

  if (labLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!lab) return <Alert severity="error">{tc('errors.notFound')}</Alert>;

  return (
    <Stack spacing={3}>
      <Button component={RouterLink} to="/doctor/marketplace" size="small" sx={{ alignSelf: 'flex-start' }}>
        ← {t('labProfile.back')}
      </Button>

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="flex-start">
            <Avatar src={lab.logo_url ?? undefined} variant="rounded" sx={{ width: 80, height: 80 }}>
              <BusinessIcon sx={{ fontSize: 40 }} />
            </Avatar>
            <Stack flex={1} spacing={1}>
              <Typography variant="h4">{lab.public_name}</Typography>
              {lab.city && <Typography color="text.secondary">{lab.city}</Typography>}
              {lab.short_description && <Typography>{lab.short_description}</Typography>}
              <Stack direction="row" spacing={2} flexWrap="wrap">
                {lab.contact_phone && (
                  <Typography variant="body2" color="text.secondary">
                    {lab.contact_phone}
                  </Typography>
                )}
                {lab.contact_email && (
                  <Typography variant="body2" color="text.secondary">
                    {lab.contact_email}
                  </Typography>
                )}
                {lab.working_address && (
                  <Typography variant="body2" color="text.secondary">
                    {lab.working_address}
                  </Typography>
                )}
              </Stack>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Stack>
        <Typography variant="h5" sx={{ mb: 2 }}>
          {t('labProfile.services')}
        </Typography>
        {services.length === 0 ? (
          <Alert severity="info">{t('labProfile.noServices')}</Alert>
        ) : (
          <Grid container spacing={2}>
            {services.map((s) => {
              const linked = s.linked_lab_form_id ? formsById.get(s.linked_lab_form_id) : null;
              const orderable = !!linked && linked.status === 'PUBLISHED';
              return (
                <Grid key={s.id} item xs={12} sm={6} md={4}>
                  <Card>
                    <CardActionArea
                      disabled={!orderable}
                      onClick={() =>
                        navigate(`/doctor/orders/new?lab=${lab.id}&service=${s.id}`)
                      }
                    >
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography variant="h6">{s.name}</Typography>
                          {s.short_description && (
                            <Typography variant="body2" color="text.secondary">
                              {s.short_description}
                            </Typography>
                          )}
                          <Stack direction="row" spacing={1} alignItems="center">
                            {(s.average_turnaround_days || s.average_turnaround_label) && (
                              <Chip
                                size="small"
                                variant="outlined"
                                label={
                                  s.average_turnaround_label ??
                                  t('labProfile.turnaround', { days: s.average_turnaround_days })
                                }
                              />
                            )}
                          </Stack>
                          <Box sx={{ pt: 1 }}>
                            <Button
                              variant="contained"
                              size="small"
                              disabled={!orderable}
                              fullWidth
                            >
                              {orderable ? t('labProfile.orderCta') : t('labProfile.orderDisabled')}
                            </Button>
                          </Box>
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
    </Stack>
  );
}
