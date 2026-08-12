import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { Callout, CardStack, PageHeader, SectionCard, StatusPill } from '@/components/design';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { ServiceBasicsForm } from '@/features/lab/services/ServiceBasicsForm';
import {
  basicsToRow,
  emptyServiceBasics,
  serviceBasicsSchema,
  type ServiceBasicsInput,
} from '@/features/lab/services/serviceBasicsSchema';
import { FieldsPanel } from '@/features/lab/forms/FieldsPanel';
import { PricingPanel } from '@/features/lab/forms/PricingPanel';
import { OrderForm } from '@/features/orderForms/OrderForm';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { templateName } from '@/features/lab/forms/templateLabels';
import { isPricingComplete, pricingIssues } from '@/utils/pricing';
import { pricingIssueMessage } from '@/features/lab/forms/pricingIssueMessages';
import type {
  FormConfiguration,
  LabFormRow,
  LabFormVersionRow,
  LabServiceRow,
  PlatformFormTemplateRow,
  PricingConfig,
} from '@/types/database';

type CustomizeTab = 'fields' | 'pricing' | 'preview';

function parsePositiveInt(s: string | undefined | null): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

export function LabServiceEditPage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const methods = useForm<ServiceBasicsInput>({
    resolver: zodResolver(serviceBasicsSchema),
    defaultValues: emptyServiceBasics,
    mode: 'onBlur',
  });

  const [config, setConfig] = useState<FormConfiguration | null>(null);
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [tab, setTab] = useState<CustomizeTab>('fields');
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: service, isLoading: loadingService } = useQuery({
    queryKey: ['lab-service', serviceId],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_services')
        .select('*')
        .eq('id', serviceId!)
        .maybeSingle();
      if (error) throw error;
      return data as LabServiceRow | null;
    },
  });

  const { data: form } = useQuery({
    queryKey: ['lab-form-by-service', service?.linked_lab_form_id],
    enabled: !!service?.linked_lab_form_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_forms')
        .select('*')
        .eq('id', service!.linked_lab_form_id!)
        .maybeSingle();
      if (error) throw error;
      return data as LabFormRow | null;
    },
  });

  const { data: version } = useQuery({
    queryKey: ['lab-form-version', form?.current_version_id],
    enabled: !!form?.current_version_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_form_versions')
        .select('*')
        .eq('id', form!.current_version_id!)
        .maybeSingle();
      if (error) throw error;
      return data as LabFormVersionRow | null;
    },
  });

  const { data: template } = useQuery({
    queryKey: ['platform-template', form?.template_id],
    enabled: !!form?.template_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_form_templates')
        .select('*')
        .eq('id', form!.template_id)
        .maybeSingle();
      if (error) throw error;
      return data as PlatformFormTemplateRow | null;
    },
  });

  useEffect(() => {
    if (!service) return;
    methods.reset({
      name: service.name,
      short_description: service.short_description ?? '',
      average_turnaround_days:
        service.average_turnaround_days != null
          ? String(service.average_turnaround_days)
          : '',
      cover_image_url: service.cover_image_url ?? '',
      is_active: service.is_active,
    });
  }, [service, methods]);

  useEffect(() => {
    if (!version) return;
    setConfig(version.configuration_json);
    setPricing(version.pricing_configuration_json);
  }, [version]);

  const save = useMutation({
    mutationFn: async ({ publish }: { publish?: boolean } = {}) => {
      if (!service || !form || !config || !pricing) throw new Error('Not loaded');
      const valid = await methods.trigger();
      if (!valid) throw new Error('Fix errors in the service basics');
      const basics = methods.getValues();

      const { error: e1 } = await supabase
        .from('lab_services')
        .update(basicsToRow(basics))
        .eq('id', service.id);
      if (e1) throw e1;

      const targetStatus = publish === true
        ? 'PUBLISHED'
        : publish === false
          ? 'DRAFT'
          : form.status;

      if (targetStatus === 'PUBLISHED') {
        const { error: e2 } = await supabase.rpc('publish_lab_form', {
          p_form_id: form.id,
          p_configuration: config,
          p_pricing: pricing,
        });
        if (e2) throw e2;
      } else {
        const { data: maxRow, error: e0 } = await supabase
          .from('lab_form_versions')
          .select('version_number')
          .eq('lab_form_id', form.id)
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (e0) throw e0;
        const nextVersion = (maxRow?.version_number ?? 0) + 1;
        const { data: newVersion, error: eIns } = await supabase
          .from('lab_form_versions')
          .insert({
            lab_form_id: form.id,
            version_number: nextVersion,
            configuration_json: config,
            pricing_configuration_json: pricing,
            status: 'DRAFT',
          })
          .select()
          .single();
        if (eIns) throw eIns;
        const { error: eUpd } = await supabase
          .from('lab_forms')
          .update({ current_version_id: newVersion.id, status: 'DRAFT' })
          .eq('id', form.id);
        if (eUpd) throw eUpd;
      }
    },
    onSuccess: () => {
      setSuccess(t('services.edit.saveSuccess'));
      qc.invalidateQueries({ queryKey: ['lab-service', serviceId] });
      qc.invalidateQueries({ queryKey: ['lab-form-by-service'] });
      qc.invalidateQueries({ queryKey: ['lab-form-version'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!service) throw new Error('No service');
      const formId = service.linked_lab_form_id;
      const { error } = await supabase.from('lab_services').delete().eq('id', service.id);
      if (error) throw error;
      if (formId) {
        await supabase.from('lab_forms').delete().eq('id', formId);
      }
    },
    onSuccess: () => navigate('/lab/services'),
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  if (loadingService) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!service) return <Alert severity="error">{tc('errors.notFound')}</Alert>;

  const canShowCustomize = !!config && !!pricing && !!form;
  const canPublish =
    canShowCustomize && isPricingComplete(pricing ?? undefined, template?.code);
  const isPublished = form?.status === 'PUBLISHED';

  // suppress unused variable warning — labId is used via auth context for the lab guard
  void labId;

  return (
    <>
      <PageHeader
        backTo="/lab/services"
        title={t('services.edit.title')}
        subtitle={service.name}
        chips={
          form && (
            <StatusPill tone={isPublished ? 'success' : 'warning'} dot>
              {isPublished ? t('services.formPublished') : t('services.formDraft')}
              {version ? ` · v${version.version_number}` : ''}
            </StatusPill>
          )
        }
        actions={
          <Button color="error" variant="outlined" onClick={() => setDeleteOpen(true)}>
            {tc('actions.delete')}
          </Button>
        }
      />

      <CardStack sx={{ maxWidth: 900 }}>
      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <FormProvider {...methods}>
        <ServiceBasicsForm />
      </FormProvider>

      {template && (
        <Callout tone="neutral" icon="lock" title={templateName(tc, template.code, template.name)}>
          {t('services.edit.templateLocked')}
        </Callout>
      )}

      {canShowCustomize && config && pricing && (
        <SectionCard icon="tune" title={t('services.edit.customize')}>
            <Stack spacing={2}>
              <Tabs value={tab} onChange={(_, v: CustomizeTab) => setTab(v)}>
                <Tab value="fields" label={t('forms.editor.tabs.fields')} />
                <Tab value="pricing" label={t('forms.editor.tabs.pricing')} />
                <Tab value="preview" label={t('forms.editor.tabs.preview')} />
              </Tabs>
              {tab === 'fields' && <FieldsPanel config={config} onChange={setConfig} />}
              {tab === 'pricing' && (
                <PricingPanel
                  pricing={pricing}
                  onChange={setPricing}
                  fields={config.fields}
                  templateCode={template?.code}
                  maxRushTurnaroundDays={parsePositiveInt(
                    methods.watch('average_turnaround_days'),
                  )}
                />
              )}
              {tab === 'preview' && (
                <Stack spacing={2}>
                  <OrderForm
                    configuration={config}
                    pricing={pricing}
                    values={previewValues}
                    onChange={setPreviewValues}
                  />
                  <PriceBreakdown pricing={pricing} answers={previewValues} />
                </Stack>
              )}
            </Stack>
        </SectionCard>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
        <Button onClick={() => navigate('/lab/services')}>{tc('actions.cancel')}</Button>
        <Button
          variant="outlined"
          disabled={!canShowCustomize || save.isPending}
          onClick={() => save.mutate({})}
        >
          {tc('actions.save')}
        </Button>
        {form?.status === 'DRAFT' && (
          <Button
            variant="contained"
            disabled={!canPublish || save.isPending}
            onClick={() => save.mutate({ publish: true })}
          >
            {t('services.edit.publish')}
          </Button>
        )}
      </Stack>

      {form?.status === 'DRAFT' && canShowCustomize && !canPublish && (() => {
        // Spell out which material/field is blocking publish, right under the heading.
        const issues = pricingIssues(pricing ?? undefined, template?.code);
        return (
          <Callout tone="brand" title={t('services.create.pricingRequiredForPublish')}>
            {issues.length > 0
              ? issues.map((issue, i) => (
                  <Box key={i} component="span" sx={{ display: 'block' }}>
                    {pricingIssueMessage(issue, t)}
                  </Box>
                ))
              : undefined}
          </Callout>
        );
      })()}

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>{t('services.deleteConfirm.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('services.deleteConfirm.body')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>{tc('actions.cancel')}</Button>
          <Button color="error" variant="contained" onClick={() => remove.mutate()}>
            {tc('actions.delete')}
          </Button>
        </DialogActions>
      </Dialog>
      </CardStack>
    </>
  );
}
