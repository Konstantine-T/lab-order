import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Divider,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { Link as RouterLink, Navigate, useLocation } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { PublicAuthLayout } from '@/layouts/PublicAuthLayout';
import { RHFTextField } from '@/components/RHFTextField';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { t } = useTranslation('auth');
  const { signIn, session, loading } = useAuth();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (!loading && session) {
    const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/';
    return <Navigate to={from} replace />;
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
    <PublicAuthLayout>
      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Stack spacing={0.5}>
              <Typography variant="h4">{t('login.title')}</Typography>
              <Typography color="text.secondary">{t('login.subtitle')}</Typography>
            </Stack>

            {serverError && <Alert severity="error">{serverError}</Alert>}

            <FormProvider {...methods}>
              <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
                <Stack spacing={2}>
                  <RHFTextField
                    name="email"
                    type="email"
                    label={t('login.email')}
                    autoComplete="email"
                  />
                  <RHFTextField
                    name="password"
                    type="password"
                    label={t('login.password')}
                    autoComplete="current-password"
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

            <Stack direction="row" justifyContent="space-between">
              <Link component={RouterLink} to="/forgot-password" variant="body2">
                {t('login.forgotPassword')}
              </Link>
            </Stack>

            <Divider />

            <Stack spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                {t('login.noAccount')}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button component={RouterLink} to="/register/doctor" variant="outlined" size="small">
                  {t('login.registerAsDoctor')}
                </Button>
                <Button component={RouterLink} to="/register/lab" variant="outlined" size="small">
                  {t('login.registerAsLab')}
                </Button>
                <Button component={RouterLink} to="/register/clinic" variant="outlined" size="small">
                  {t('login.registerAsClinic')}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </PublicAuthLayout>
  );
}
