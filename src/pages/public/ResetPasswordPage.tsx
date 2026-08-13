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
import type { EmailOtpType } from '@supabase/supabase-js';
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
    let active = true;

    // Recovery links reach us in a few different shapes and we accept all of
    // them so any link Supabase sends works:
    //   • implicit  → "#access_token=…&type=recovery"  (auto-parsed by
    //     detectSessionInUrl; we just read the resulting session)
    //   • PKCE      → "?code=…"                          (exchangeCodeForSession)
    //   • token_hash→ "?token_hash=…&type=recovery"      (verifyOtp — NOT auto-handled)
    async function establish() {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const type = params.get('type');
      const code = params.get('code');
      const hadError = params.get('error') || params.get('error_description');

      try {
        if (hadError) {
          if (active) setSessionReady(false);
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as EmailOtpType,
          });
          if (active) setSessionReady(!error);
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (active) setSessionReady(!error);
        } else {
          // Implicit hash already consumed by detectSessionInUrl on load.
          const { data: { session } } = await supabase.auth.getSession();
          if (active) setSessionReady((prev) => prev ?? !!session);
        }
      } catch {
        if (active) setSessionReady(false);
      } finally {
        // Strip the token from the address bar so a refresh can't re-run it
        // (single-use) and it never leaks into history.
        if (window.location.search || window.location.hash) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    }

    // Backup: if PASSWORD_RECOVERY fires after mount, honor it too.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && active) setSessionReady(true);
    });

    void establish();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
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
                      required
                    />
                    <RHFTextField
                      name="confirm_password"
                      type="password"
                      label={t('resetPassword.confirmPassword')}
                      autoComplete="new-password"
                      required
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
