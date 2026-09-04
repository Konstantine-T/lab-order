import { Alert, Box, Button, CircularProgress, FormControlLabel, Switch, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

  const queryClient = useQueryClient();

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

  // Optimistic on purpose: a switch that waits for a round trip before moving
  // feels broken, and the only failure mode here is a stale flag that the
  // invalidate corrects a moment later.
  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('lab_services')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, is_active }) => {
      await queryClient.cancelQueries({ queryKey: ['lab-services-with-forms', labId] });
      const previous = queryClient.getQueryData(['lab-services-with-forms', labId]);
      queryClient.setQueryData(['lab-services-with-forms', labId], (old: ServiceWithForm[] | undefined) =>
        (old ?? []).map((row) => (row.id === id ? { ...row, is_active } : row)),
      );
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['lab-services-with-forms', labId], ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['lab-services-with-forms', labId] });
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
                  name={s.name}
                  description={s.short_description ?? undefined}
                  onClick={() => navigate(`/lab/services/${s.id}`)}
                  imageUrl={s.cover_image_url}
                  headerAction={
                    // Flipping a service on or off is a one-second decision, so
                    // it belongs here next to every other service's state — not
                    // three clicks deep inside an edit form.
                    <FormControlLabel
                      sx={{ mr: 0, ml: 0 }}
                      labelPlacement="start"
                      disabled={toggleActive.isPending}
                      control={
                        <Switch
                          size="small"
                          checked={s.is_active}
                          onChange={(e) =>
                            toggleActive.mutate({ id: s.id, is_active: e.target.checked })
                          }
                          sx={{ ml: 0.75 }}
                        />
                      }
                      label={
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, color: s.is_active ? 'success.main' : 'text.secondary' }}
                        >
                          {s.is_active ? t('services.active') : t('services.inactive')}
                        </Typography>
                      }
                    />
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
