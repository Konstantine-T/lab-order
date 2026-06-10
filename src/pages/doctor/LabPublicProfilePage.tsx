import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import { Link as RouterLink, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import type { LabRow, LabServiceRow } from '@/types/database';
import type { FormStatus } from '@/types/database';
import { templateName } from '@/features/lab/forms/templateLabels';
import { serviceImageUrl } from '@/utils/serviceDefaults';

export function LabPublicProfilePage() {
  const { labId } = useParams<{ labId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Set when the doctor arrived here via "Continue project" — carry them onto
  // the order CTA so the wizard pre-fills + locks the patient and links lineage.
  const continuePatient = searchParams.get('patient');
  const continuesOrder = searchParams.get('continues');

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

  type FormWithTemplate = {
    id: string;
    status: FormStatus;
    platform_form_templates: { code: string; name: string } | null;
  };

  const { data: forms = [] } = useQuery({
    queryKey: ['public-lab-forms', labId, linkedFormIds.join(',')],
    enabled: linkedFormIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_forms')
        .select('id, status, platform_form_templates(code, name)')
        .in('id', linkedFormIds);
      if (error) throw error;
      return (data ?? []) as unknown as FormWithTemplate[];
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

      {(continuePatient || continuesOrder) && (
        <Alert severity="info">{t('labProfile.continuingFor')}</Alert>
      )}

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
              const tplCode = linked?.platform_form_templates?.code;
              const tplName = templateName(tc, tplCode);
              const imgUrl = serviceImageUrl(s.cover_image_url, tplCode);
              return (
                <Grid key={s.id} item xs={12} sm={6} md={4} sx={{ display: 'flex' }}>
                  <Card sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                    <CardActionArea
                      disabled={!orderable}
                      onClick={() =>
                        navigate(
                          `/doctor/orders/new?lab=${lab.id}&service=${s.id}` +
                            (continuePatient ? `&patient=${continuePatient}` : '') +
                            (continuesOrder ? `&continues=${continuesOrder}` : ''),
                        )
                      }
                      sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                    >
                      {imgUrl && (
                        <CardMedia
                          component="img"
                          height={160}
                          image={imgUrl}
                          alt={s.name}
                          sx={{ objectFit: 'cover' }}
                        />
                      )}
                      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                        <Stack spacing={1} sx={{ flexGrow: 1 }}>
                          {tplName && (
                            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              {tplName}
                            </Typography>
                          )}
                          <Typography variant="h6" sx={{ lineHeight: 1.3 }}>{s.name}</Typography>
                          {s.short_description && (
                            <Typography variant="body2" color="text.secondary">
                              {s.short_description}
                            </Typography>
                          )}
                          <Box sx={{ flexGrow: 1 }} />
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
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
