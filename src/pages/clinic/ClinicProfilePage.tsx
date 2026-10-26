import { useEffect, useState } from 'react';
import { Alert, Box, Button, Stack } from '@mui/material';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { RHFTextField } from '@/components/RHFTextField';
import { CardStack, PageHeader, SectionCard } from '@/components/design';

const optional = z.string().trim().optional().or(z.literal(''));
const optionalEmail = z.string().trim().email().optional().or(z.literal(''));

const schema = z.object({
  public_name: z.string().trim().min(2),
  working_address: z.string().trim().min(3),
  city: z.string().trim().min(2),
  contact_phone: optional,
  contact_email: optionalEmail,
  legal_name: optional,
  identification_code: optional,
  legal_address: optional,
  invoice_email: optionalEmail,
});
type FormValues = z.infer<typeof schema>;

/**
 * The clinic's own details (0050). Its doctors' orders for it are delivered
 * to the working address and invoiced to the legal entity, both filled in
 * automatically from here, so the working address is required: nobody can
 * order for a clinic that has none.
 *
 * Saved through the owner policy on `clinics` (0011); the session's clinic
 * row is refreshed after, which is what the order wizard reads.
 */
export function ClinicProfilePage() {
  const { t } = useTranslation('clinic');
  const { t: tc } = useTranslation('common');
  const { user, refreshUser } = useAuth();
  const clinic = user?.clinic;
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      public_name: '',
      working_address: '',
      city: '',
      contact_phone: '',
      contact_email: '',
      legal_name: '',
      identification_code: '',
      legal_address: '',
      invoice_email: '',
    },
  });

  useEffect(() => {
    if (!clinic) return;
    methods.reset({
      public_name: clinic.public_name ?? '',
      working_address: clinic.working_address ?? '',
      city: clinic.city ?? '',
      contact_phone: clinic.contact_phone ?? '',
      contact_email: clinic.contact_email ?? '',
      legal_name: clinic.legal_name ?? '',
      identification_code: clinic.identification_code ?? '',
      legal_address: clinic.legal_address ?? '',
      invoice_email: clinic.invoice_email ?? '',
    });
  }, [clinic, methods]);

  const onSubmit = async (v: FormValues) => {
    if (!clinic) return;
    setSaved(false);
    setFailed(false);
    const blank = (s: string | undefined) => s?.trim() || null;
    const { error } = await supabase
      .from('clinics')
      .update({
        public_name: v.public_name.trim(),
        working_address: v.working_address.trim(),
        city: v.city.trim(),
        contact_phone: blank(v.contact_phone),
        contact_email: blank(v.contact_email),
        legal_name: blank(v.legal_name),
        identification_code: blank(v.identification_code),
        legal_address: blank(v.legal_address),
        invoice_email: blank(v.invoice_email),
      })
      .eq('id', clinic.id);
    if (error) {
      setFailed(true);
      return;
    }
    setSaved(true);
    await refreshUser({ silent: true });
  };

  return (
    <>
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
          <CardStack sx={{ maxWidth: 760 }}>
            {saved && <Alert severity="success">{t('profile.saved')}</Alert>}
            {failed && <Alert severity="error">{tc('errors.generic')}</Alert>}

            <SectionCard icon="local_shipping" title={t('profile.delivery')}>
              <Stack spacing={2}>
                <RHFTextField name="public_name" label={t('profile.fields.publicName')} required />
                <RHFTextField
                  name="working_address"
                  label={t('profile.fields.workingAddress')}
                  helperText={t('profile.fields.workingAddressHelp')}
                  required
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <RHFTextField name="city" label={t('profile.fields.city')} required />
                  <RHFTextField name="contact_phone" label={t('profile.fields.phone')} />
                </Stack>
                <RHFTextField name="contact_email" label={t('profile.fields.email')} type="email" />
              </Stack>
            </SectionCard>

            <SectionCard icon="receipt_long" title={t('profile.invoicing')}>
              <Stack spacing={2}>
                <RHFTextField
                  name="legal_name"
                  label={t('profile.fields.legalName')}
                  helperText={t('profile.fields.legalNameHelp')}
                />
                <RHFTextField name="identification_code" label={t('profile.fields.identificationCode')} />
                <RHFTextField name="legal_address" label={t('profile.fields.legalAddress')} />
                <RHFTextField
                  name="invoice_email"
                  label={t('profile.fields.invoiceEmail')}
                  helperText={t('profile.fields.invoiceEmailHelp')}
                  type="email"
                />
              </Stack>
            </SectionCard>

            <Box>
              <Button type="submit" variant="contained" disabled={methods.formState.isSubmitting}>
                {methods.formState.isSubmitting ? tc('actions.saving') : tc('actions.save')}
              </Button>
            </Box>
          </CardStack>
        </form>
      </FormProvider>
    </>
  );
}
