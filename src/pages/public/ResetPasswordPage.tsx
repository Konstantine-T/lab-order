import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Link,
  Stack,
} from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { PublicAuthLayout } from '@/layouts/PublicAuthLayout';
import { RHFTextField } from '@/components/RHFTextField';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { supabase } from '@/lib/supabase';

const schema = z
  .object({
    password: z.string().min(8),
    confirm_password: z.string().min(8),
  })
  .refine((d) => d.password === d.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match.',
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // null = still detecting, true = valid session, false = no session (link invalid)
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm_password: '' },
  });

  useEffect(() => {
    // Backup: if PASSWORD_RECOVERY fires after mount (rare with detectSessionInUrl)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });

    // Primary check: session is already established by the time we mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Don't override if onAuthStateChange already set it to true
      setSessionReady((prev) => prev ?? !!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setServerError(error.message);
      return;
    }
    setSuccess(true);
    // Sign out so the user must log in with the new password.
    await supabase.auth.signOut();
    setTimeout(() => navigate('/login'), 2000);
  };

  if (sessionReady === null) return <FullPageSpinner />;

  if (!sessionReady) {
    return (
      <PublicAuthLayout title={t('resetPassword.expiredTitle')} subtitle={t('resetPassword.expiredMessage')}>
        <Stack spacing={2.5}>
              <Link component={RouterLink} to="/forgot-password" variant="body2">
                {t('resetPassword.requestNewLink')}
              </Link>
            </Stack>
      </PublicAuthLayout>
    );
  }

  return (
    <PublicAuthLayout title={t('resetPassword.title')}>
          <Stack spacing={2.5}>
            {success && <Alert severity="success">{t('resetPassword.success')}</Alert>}
            {serverError && <Alert severity="error">{serverError}</Alert>}
            {!success && (
              <FormProvider {...methods}>
                <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
                  <Stack spacing={2}>
                    <RHFTextField
                      name="password"
                      type="password"
                      label={t('resetPassword.newPassword')}
                      autoComplete="new-password"
                    />
                    <RHFTextField
                      name="confirm_password"
                      type="password"
                      label={t('resetPassword.confirmPassword')}
                      autoComplete="new-password"
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={methods.formState.isSubmitting}
                    >
                      {t('resetPassword.submit')}
                    </Button>
                  </Stack>
                </form>
              </FormProvider>
            )}
          </Stack>
    </PublicAuthLayout>
  );
}
