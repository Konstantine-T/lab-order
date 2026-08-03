import { useEffect, useState } from 'react';
import { Alert, Box, Button, Stack } from '@mui/material';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { CardStack, PageHeader, SectionCard } from '@/components/design';
import { RHFTextField } from '@/components/RHFTextField';
import { LabApprovalBanner } from '@/features/lab/LabApprovalBanner';
import {
  isLabProfileComplete,
  labProfileSchema,
  type LabProfileInput,
} from '@/features/lab/labProfileSchema';

const empty: LabProfileInput = {
  public_name: '',
  short_description: '',
  logo_url: '',
  legal_name: '',
  identification_code: '',
  legal_address: '',
  working_address: '',
  city: '',
  country: '',
  contact_person_name: '',
  contact_phone: '',
  contact_email: '',
  bank_name: '',
  bank_account_iban: '',
  payment_instructions: '',
};

export function LabProfilePage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user, refreshUser } = useAuth();
  const lab = user?.lab;

  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const methods = useForm<LabProfileInput>({
    resolver: zodResolver(labProfileSchema),
    defaultValues: empty,
    mode: 'onChange',
  });

  useEffect(() => {
    if (!lab) return;
    methods.reset({
      public_name: lab.public_name ?? '',
      short_description: lab.short_description ?? '',
      logo_url: lab.logo_url ?? '',
      legal_name: lab.legal_name ?? '',
      identification_code: lab.identification_code ?? '',
      legal_address: lab.legal_address ?? '',
      working_address: lab.working_address ?? '',
      city: lab.city ?? '',
      country: lab.country ?? '',
      contact_person_name: lab.contact_person_name ?? '',
      contact_phone: lab.contact_phone ?? '',
      contact_email: lab.contact_email ?? '',
      bank_name: lab.bank_name ?? '',
      bank_account_iban: lab.bank_account_iban ?? '',
      payment_instructions: lab.payment_instructions ?? '',
    });
  }, [lab, methods]);

  if (!lab) return null;

  const editable =
    lab.approval_status === 'PENDING_APPROVAL' || lab.approval_status === 'CHANGES_REQUESTED';
  const readOnly = !editable;
  const showResubmit = lab.approval_status === 'CHANGES_REQUESTED';

  const watched = methods.watch();
  const isComplete = isLabProfileComplete(watched);

  const handleSave = async (values: LabProfileInput) => {
    setError(null);
    setSuccess(null);
    const { error: e } = await supabase
      .from('labs')
      .update({
        public_name: values.public_name,
        short_description: values.short_description || null,
        logo_url: values.logo_url || null,
        legal_name: values.legal_name || null,
        identification_code: values.identification_code || null,
        legal_address: values.legal_address || null,
        working_address: values.working_address || null,
        city: values.city || null,
        country: values.country || null,
        contact_person_name: values.contact_person_name || null,
        contact_phone: values.contact_phone || null,
        contact_email: values.contact_email || null,
        bank_name: values.bank_name || null,
        bank_account_iban: values.bank_account_iban || null,
        payment_instructions: values.payment_instructions || null,
      })
      .eq('id', lab.id);
    if (e) {
      setError(e.message);
      return;
    }
    setSuccess(t('profile.saveSuccess'));
    await refreshUser();
  };

  const submitForApproval = async () => {
    setError(null);
    setSuccess(null);
    const { error: e } = await supabase
      .from('labs')
      .update({ approval_status: 'PENDING_APPROVAL', approval_note: null })
      .eq('id', lab.id);
    if (e) {
      setError(e.message);
      return;
    }
    setSuccess(t('profile.submitSuccess'));
    await refreshUser();
  };

  return (
    <>
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />

      <CardStack sx={{ maxWidth: 900 }}>
      <LabApprovalBanner status={lab.approval_status} note={lab.approval_note} />

      {success && <Alert severity="success">{success}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(handleSave)} noValidate>
          <Stack spacing={3}>
            <SectionCard icon="store" title={t('profile.sections.public')}>
                <Stack spacing={2}>
                  <RHFTextField name="public_name" label={t('profile.fields.publicName')} required />
                  <RHFTextField
                    name="short_description"
                    label={t('profile.fields.shortDescription')}
                    multiline
                    minRows={2}
                  />
                  <RHFTextField name="logo_url" label={t('profile.fields.logoUrl')} />
                </Stack>
            </SectionCard>

            <SectionCard icon="description" title={t('profile.sections.legal')}>
                <Stack spacing={2}>
                  <RHFTextField name="legal_name" label={t('profile.fields.legalName')} required />
                  <RHFTextField
                    name="identification_code"
                    label={t('profile.fields.identificationCode')}
                    required
                  />
                  <RHFTextField
                    name="legal_address"
                    label={t('profile.fields.legalAddress')}
                    required
                  />
                  <RHFTextField
                    name="working_address"
                    label={t('profile.fields.workingAddress')}
                    required
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <RHFTextField name="city" label={t('profile.fields.city')} required />
                    <RHFTextField name="country" label={t('profile.fields.country')} required />
                  </Stack>
                </Stack>
            </SectionCard>

            <SectionCard icon="call" title={t('profile.sections.contact')}>
                <Stack spacing={2}>
                  <RHFTextField
                    name="contact_person_name"
                    label={t('profile.fields.contactPersonName')}
                    required
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <RHFTextField
                      name="contact_phone"
                      label={t('profile.fields.contactPhone')}
                      required
                    />
                    <RHFTextField
                      name="contact_email"
                      type="email"
                      label={t('profile.fields.contactEmail')}
                      required
                    />
                  </Stack>
                </Stack>
            </SectionCard>

            <SectionCard icon="payments" title={t('profile.sections.billing')}>
                <Stack spacing={2}>
                  <RHFTextField name="bank_name" label={t('profile.fields.bankName')} required />
                  <RHFTextField
                    name="bank_account_iban"
                    label={t('profile.fields.bankAccountIban')}
                    required
                  />
                  <RHFTextField
                    name="payment_instructions"
                    label={t('profile.fields.paymentInstructions')}
                    multiline
                    minRows={3}
                    required
                  />
                </Stack>
            </SectionCard>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button
                type="submit"
                variant={showResubmit ? 'outlined' : 'contained'}
                disabled={methods.formState.isSubmitting || readOnly}
              >
                {tc('actions.save')}
              </Button>
              <Box sx={{ flex: 1 }} />
              {showResubmit && (
                <Button
                  variant="contained"
                  disabled={!isComplete || methods.formState.isSubmitting}
                  onClick={() =>
                    void methods.handleSubmit(async (vals) => {
                      await handleSave(vals);
                      await submitForApproval();
                    })()
                  }
                >
                  {t('profile.submitForApproval')}
                </Button>
              )}
            </Stack>

            {editable && !isComplete && (
              <Alert severity="info">{t('profile.incompleteWarning')}</Alert>
            )}
          </Stack>
        </form>
      </FormProvider>
      </CardStack>
    </>
  );
}
