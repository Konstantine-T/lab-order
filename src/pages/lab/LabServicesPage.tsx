import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { ServiceCard } from '@/components/ServiceCard';
import {
  Callout,
  CardGrid,
  CardStack,
  EmptyState,
  Icon,
  MetaChip,
  PageHeader,
  StatusPill,
} from '@/components/design';
import { templateName } from '@/features/lab/forms/templateLabels';
import type { LabFormRow, LabServiceRow } from '@/types/database';

type ServiceWithForm = LabServiceRow & {
  lab_forms:
    | (Pick<LabFormRow, 'id' | 'status' | 'title'> & {
        platform_form_templates: { code: string } | null;
      })
    | null;
};

export function LabServicesPage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const navigate = useNavigate();

  const { data: services = [], isLoading, error } = useQuery({
    queryKey: ['lab-services-with-forms', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_services')
        .select(
          'id, lab_id, name, short_description, average_turnaround_days, average_turnaround_label, cover_image_url, linked_lab_form_id, service_phase_type, is_active, sort_order, created_at, updated_at, ' +
            'lab_forms!lab_services_linked_form_fk(id, status, title, platform_form_templates(code))',
        )
        .eq('lab_id', labId!)
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as ServiceWithForm[];
    },
  });

  return (
    <>
      <PageHeader
        title={t('services.title')}
        subtitle={t('services.subtitle')}
        actions={
          <Button
            startIcon={<Icon name="add" size={17} />}
            variant="contained"
            component={RouterLink}
            to="/lab/services/new"
          >
            {t('services.addNew')}
          </Button>
        }
      />

      <CardStack>
        {error && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

        <Callout tone="brand">{t('services.marketplaceRule')}</Callout>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <CardGrid>
            {services.map((s) => {
              const formStatus = s.lab_forms?.status ?? null;
              const formPublished = formStatus === 'PUBLISHED';
              const tplCode = s.lab_forms?.platform_form_templates?.code;
              return (
                <ServiceCard
                  key={s.id}
                  templateCode={tplCode}
                  templateLabel={templateName(tc, tplCode)}
                  name={s.name}
                  description={s.short_description ?? undefined}
                  onClick={() => navigate(`/lab/services/${s.id}`)}
                  headerAction={
                    <StatusPill tone={s.is_active ? 'success' : 'neutral'} dot>
                      {s.is_active ? t('services.active') : t('services.inactive')}
                    </StatusPill>
                  }
                  chips={
                    <>
                      {(s.average_turnaround_days || s.average_turnaround_label) && (
                        <MetaChip icon={<Icon name="schedule" size={13} />}>
                          {s.average_turnaround_label ??
                            t('services.turnaroundDays', { n: s.average_turnaround_days })}
                        </MetaChip>
                      )}
                      {formStatus ? (
                        <StatusPill tone={formPublished ? 'success' : 'warning'} dot>
                          {formPublished ? t('services.formPublished') : t('services.formDraft')}
                        </StatusPill>
                      ) : (
                        <StatusPill tone="warning" dot>
                          {t('services.noLinkedForm')}
                        </StatusPill>
                      )}
                      {s.is_active && formPublished && (
                        <StatusPill tone="brand">{t('services.orderable')}</StatusPill>
                      )}
                    </>
                  }
                  action={
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Icon name="tune" size={15} />}
                      onClick={() => navigate(`/lab/services/${s.id}`)}
                    >
                      {t('services.fieldsAndPricing')}
                    </Button>
                  }
                />
              );
            })}

            {/* The mockups' dashed "add from a template" tile, always last. */}
            <EmptyState
              icon="add"
              title={t('services.addFromTemplate')}
              description={t('services.addFromTemplateHint')}
              onClick={() => navigate('/lab/services/new')}
            />
          </CardGrid>
        )}
      </CardStack>
    </>
  );
}
