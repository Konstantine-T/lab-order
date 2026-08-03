import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Tab, Tabs } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Callout, CardStack, Icon, PageHeader, SectionCard } from '@/components/design';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { TemplateGrid } from '@/features/lab/forms/TemplateGrid';
import { templateName } from '@/features/lab/forms/templateLabels';
import { FieldsPanel } from '@/features/lab/forms/FieldsPanel';
import { PricingPanel } from '@/features/lab/forms/PricingPanel';
import { buildDefaultConfig } from '@/features/lab/forms/buildDefaultConfig';
import { isCustomFormComplete } from '@/features/lab/forms/CustomFormBuilder';
import { isPricingComplete } from '@/utils/pricing';
import { OrderForm } from '@/features/orderForms/OrderForm';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import type {
  FormConfiguration,
  PlatformFormTemplateRow,
  PlatformTemplateFieldRow,
  PricingConfig,
} from '@/types/database';

type CustomizeTab = 'fields' | 'pricing' | 'preview';

function parsePositiveInt(s: string | undefined | null): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

export function LabServiceCreatePage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const labId = user?.lab?.id;
  const navigate = useNavigate();

  const methods = useForm<ServiceBasicsInput>({
    resolver: zodResolver(serviceBasicsSchema),
    defaultValues: emptyServiceBasics,
    mode: 'onBlur',
  });

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [config, setConfig] = useState<FormConfiguration | null>(null);
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [tab, setTab] = useState<CustomizeTab>('fields');
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: templateFields, isFetching: loadingTemplate } = useQuery({
    queryKey: ['platform-template-fields', templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_template_fields')
        .select('*')
        .eq('template_id', templateId!)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as PlatformTemplateFieldRow[];
    },
  });

  const { data: templateRow } = useQuery({
    queryKey: ['platform-template', templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_form_templates')
        .select('*')
        .eq('id', templateId!)
        .maybeSingle();
      if (error) throw error;
      return data as PlatformFormTemplateRow | null;
    },
  });

  useEffect(() => {
    if (!templateFields || !templateRow) return;
    const { configuration, pricing: pricingDefault } = buildDefaultConfig(
      templateFields,
      templateRow.code,
    );
    setConfig(configuration);
    setPricing(pricingDefault);
    setPreviewValues({});
    setTab('fields');
  }, [templateFields, templateRow]);

  const save = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      if (!labId) throw new Error('No lab');
      if (!templateId || !config || !pricing) {
        throw new Error('Pick a template before saving');
      }
      const valid = await methods.trigger();
      if (!valid) throw new Error('Fix errors in the service basics');
      const basics = methods.getValues();

      const serviceRow = basicsToRow(basics);
      const { data: service, error: e1 } = await supabase
        .from('lab_services')
        .insert({ lab_id: labId, ...serviceRow })
        .select()
        .single();
      if (e1) throw e1;

      const { data: form, error: e2 } = await supabase
        .from('lab_forms')
        .insert({
          lab_id: labId,
          service_id: service.id,
          template_id: templateId,
          title: basics.name,
          status: publish ? 'PUBLISHED' : 'DRAFT',
        })
        .select()
        .single();
      if (e2) throw e2;

      const { data: version, error: e3 } = await supabase
        .from('lab_form_versions')
        .insert({
          lab_form_id: form.id,
          version_number: 1,
          configuration_json: config,
          pricing_configuration_json: pricing,
          status: publish ? 'PUBLISHED' : 'DRAFT',
        })
        .select()
        .single();
      if (e3) throw e3;

      const [r4, r5] = await Promise.all([
        supabase
          .from('lab_forms')
          .update({ current_version_id: version.id })
          .eq('id', form.id),
        supabase
          .from('lab_services')
          .update({ linked_lab_form_id: form.id })
          .eq('id', service.id),
      ]);
      if (r4.error) throw r4.error;
      if (r5.error) throw r5.error;

      return service.id as string;
    },
    onSuccess: () => navigate('/lab/services'),
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  const canSave = !!templateId && !!config && !!pricing;
  const canPublish =
    canSave &&
    isPricingComplete(pricing ?? undefined, templateRow?.code) &&
    (templateRow?.code !== 'OTHER_CUSTOM' || (!!config && isCustomFormComplete(config)));

  return (
    <>
      <PageHeader
        backTo="/lab/services"
        title={t('services.create.title')}
        subtitle={t('services.create.pickTemplateHelp')}
        actions={
          <Button variant="outlined" size="small" startIcon={<Icon name="contact_support" size={16} />}>
            {tc('actions.support')}
          </Button>
        }
      />

      <CardStack sx={{ maxWidth: 900 }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <FormProvider {...methods}>
        <ServiceBasicsForm />
      </FormProvider>

      <SectionCard
        icon="category"
        title={t('services.create.pickTemplate')}
        meta={t('services.create.pickTemplateHelp')}
      >
        <TemplateGrid selectedTemplateId={templateId} onSelect={setTemplateId} />
      </SectionCard>

      {templateId && loadingTemplate && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {templateId && config && pricing && !loadingTemplate && (
        <SectionCard
          icon="tune"
          title={t('services.create.customize', {
            template: templateName(tc, templateRow?.code, templateRow?.name),
          })}
          meta={t('services.create.customizeHelp')}
        >
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
                  templateCode={templateRow?.code}
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

      {canSave && !canPublish && (
        <Callout tone="brand">{t('services.create.pricingRequiredForPublish')}</Callout>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
        <Button onClick={() => navigate('/lab/services')}>{tc('actions.cancel')}</Button>
        <Button
          variant="outlined"
          disabled={!canSave || save.isPending}
          onClick={() => save.mutate({ publish: false })}
        >
          {t('services.create.saveAsDraft')}
        </Button>
        <Button
          variant="contained"
          disabled={!canPublish || save.isPending}
          onClick={() => save.mutate({ publish: true })}
        >
          {t('services.create.publish')}
        </Button>
      </Stack>
      </CardStack>
    </>
  );
}
