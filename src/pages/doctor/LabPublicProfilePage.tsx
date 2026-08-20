import { Alert, Avatar, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import {
  Callout,
  CardGrid,
  CardStack,
  EmptyState,
  Icon,
  MetaChip,
  PageHeader,
  SectionCard,
} from '@/components/design';
import { ServiceCard } from '@/components/ServiceCard';
import type { LabRow, LabServiceRow } from '@/types/database';
import type { FormStatus } from '@/types/database';
import { templateName } from '@/features/lab/forms/templateLabels';

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
    <>
      <PageHeader
        backTo="/doctor/marketplace"
        title={lab.public_name}
        subtitle={lab.city ?? undefined}
      />

      <CardStack>
        {(continuePatient || continuesOrder) && (
          // Two ways to land here carrying a patient. Only one is a
          // continuation: without `continues` this is a plain new order for the
          // patient, so saying "continuing a project" would be a lie.
          <Callout tone="brand" icon="link">
            {continuesOrder ? t('labProfile.continuingFor') : t('labProfile.newOrderFor')}
          </Callout>
        )}

        <SectionCard>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems="flex-start">
            <Avatar
              src={lab.logo_url ?? undefined}
              variant="rounded"
              sx={{ width: 72, height: 72, borderRadius: '16px', bgcolor: 'action.selected' }}
            >
              <Icon name="store" size={32} sx={{ color: 'primary.dark' }} />
            </Avatar>
            <Stack flex={1} spacing={1} sx={{ minWidth: 0 }}>
              {lab.short_description && (
                <Typography variant="body1" color="text.secondary">
                  {lab.short_description}
                </Typography>
              )}
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {lab.working_address && (
                  <MetaChip icon={<Icon name="location_on" size={13} />}>
                    {lab.working_address}
                  </MetaChip>
                )}
                {lab.contact_phone && (
                  <MetaChip icon={<Icon name="call" size={13} />}>{lab.contact_phone}</MetaChip>
                )}
                {lab.contact_email && (
                  <MetaChip icon={<Icon name="mail" size={13} />}>{lab.contact_email}</MetaChip>
                )}
              </Stack>
            </Stack>
          </Stack>
        </SectionCard>

        <Box>
          <Typography variant="h5" component="h2" sx={{ mb: 1.75 }}>
            {t('labProfile.services')}
          </Typography>

          {services.length === 0 ? (
            <EmptyState icon="category" title={t('labProfile.noServices')} minHeight={180} />
          ) : (
            <CardGrid>
              {services.map((s) => {
                const linked = s.linked_lab_form_id ? formsById.get(s.linked_lab_form_id) : null;
                const orderable = !!linked && linked.status === 'PUBLISHED';
                const tplCode = linked?.platform_form_templates?.code;
                const go = () =>
                  navigate(
                    `/doctor/orders/new?lab=${lab.id}&service=${s.id}` +
                      (continuePatient ? `&patient=${continuePatient}` : '') +
                      (continuesOrder ? `&continues=${continuesOrder}` : ''),
                  );
                return (
                  <ServiceCard
                    key={s.id}
                    templateCode={tplCode}
                    templateLabel={templateName(tc, tplCode)}
                    name={s.name}
                    description={s.short_description ?? undefined}
                    disabled={!orderable}
                    onClick={orderable ? go : undefined}
                    chips={
                      s.average_turnaround_days || s.average_turnaround_label ? (
                        <MetaChip icon={<Icon name="schedule" size={13} />}>
                          {s.average_turnaround_label ??
                            t('labProfile.turnaround', { days: s.average_turnaround_days })}
                        </MetaChip>
                      ) : undefined
                    }
                    action={
                      <Button variant="contained" size="small" disabled={!orderable} onClick={go}>
                        {orderable ? t('labProfile.orderCta') : t('labProfile.orderDisabled')}
                      </Button>
                    }
                  />
                );
              })}
            </CardGrid>
          )}
        </Box>
      </CardStack>
    </>
  );
}
