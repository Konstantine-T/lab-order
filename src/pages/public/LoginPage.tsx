import { useState } from 'react';
import { Alert, Button, Divider, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink, Navigate, useLocation } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { PublicAuthLayout } from '@/layouts/PublicAuthLayout';
import { RHFTextField } from '@/components/RHFTextField';
import type { UserRole } from '@/types/database';

/** Where each role's own area starts — the only place a login may land. */
const ROLE_HOME: Record<UserRole, string> = {
  DOCTOR: '/doctor',
  LAB_MAIN_ADMIN: '/lab',
  PLATFORM_ADMIN: '/admin',
  CLINIC_ADMIN: '/clinic',
};

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { t } = useTranslation('auth');
  const { signIn, session, user, loading } = useAuth();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  // Wait for `user`, not just `session`: the role decides where to land, and
  // it is only known once the profile has been fetched.
  if (!loading && session && user) {
    const home = ROLE_HOME[user.role] ?? '/';
    const from = (location.state as { from?: Location } | null)?.from?.pathname;
    // ProtectedRoute remembers the page you were bounced off, which is what you
    // want when a session expires mid-page. But signing out of /doctor/... and
    // back in as the clinic admin would restore a URL this role cannot open,
    // and RoleGuard answers that with /forbidden. Only resume inside your own
    // area; otherwise start at its front door.
    const inOwnArea = from === home || from?.startsWith(`${home}/`);
    return <Navigate to={inOwnArea ? from! : home} replace />;
  }

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await signIn(values.email, values.password);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setServerError(msg || t('login.invalidCredentials'));
    }
  };

  return (
    <PublicAuthLayout title={t('login.title')} subtitle={t('login.subtitle')}>
      <Stack spacing={2.5}>
        {serverError && <Alert severity="error">{serverError}</Alert>}

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
            <Stack spacing={2}>
              <RHFTextField
                name="email"
                type="email"
                label={t('login.email')}
                autoComplete="email"
                required
              />
              <RHFTextField
                name="password"
                type="password"
                label={t('login.password')}
                autoComplete="current-password"
                required
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={methods.formState.isSubmitting}
              >
                {t('login.submit')}
              </Button>
            </Stack>
          </form>
        </FormProvider>

        <Link
          component={RouterLink}
          to="/forgot-password"
          variant="body1"
          sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
        >
          {t('login.forgotPassword')}
        </Link>

        <Divider />

        <Stack spacing={1.25} alignItems="center">
          <Typography variant="body1" color="text.secondary">
            {t('login.noAccount')}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: '100%' }}>
            <Button
              component={RouterLink}
              to="/register/doctor"
              variant="outlined"
              size="small"
              fullWidth
            >
              {t('login.registerAsDoctor')}
            </Button>
            <Button
              component={RouterLink}
              to="/register/lab"
              variant="outlined"
              size="small"
              fullWidth
            >
              {t('login.registerAsLab')}
            </Button>
            <Button
              component={RouterLink}
              to="/register/clinic"
              variant="outlined"
              size="small"
              fullWidth
            >
              {t('login.registerAsClinic')}
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </PublicAuthLayout>
  );
}
