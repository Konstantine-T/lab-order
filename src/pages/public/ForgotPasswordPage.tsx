import { useState } from 'react';
import { Alert, Button, Link, Stack } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { PublicAuthLayout } from '@/layouts/PublicAuthLayout';
import { RHFTextField } from '@/components/RHFTextField';
import { supabase } from '@/lib/supabase';

const schema = z.object({ email: z.string().email() });
type FormValues = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    setDone(true);
  };

  return (
    <PublicAuthLayout title={t('forgotPassword.title')} subtitle={t('forgotPassword.subtitle')}>
        <Stack spacing={2.5}>

            {done && <Alert severity="success">{t('forgotPassword.checkInbox')}</Alert>}
            {serverError && <Alert severity="error">{serverError}</Alert>}

            {!done && (
              <FormProvider {...methods}>
                <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
                  <Stack spacing={2}>
                    <RHFTextField
                      name="email"
                      type="email"
                      label={t('forgotPassword.email')}
                      autoComplete="email"
                      required
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={methods.formState.isSubmitting}
                    >
                      {t('forgotPassword.submit')}
                    </Button>
                  </Stack>
                </form>
              </FormProvider>
            )}

            <Link component={RouterLink} to="/login" variant="body2">
              {t('forgotPassword.backToLogin')}
            </Link>
          </Stack>
    </PublicAuthLayout>
  );
}
