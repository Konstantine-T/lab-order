import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { PublicAuthLayout } from '@/layouts/PublicAuthLayout';
import { Icon } from '@/components/design';
import { RHFTextField } from '@/components/RHFTextField';
import { supabase } from '@/lib/supabase';

const schema = z
  .object({
    lab_public_name: z.string().min(2),
    owner_first_name: z.string().min(2),
    owner_last_name: z.string().min(2),
    phone: z.string().optional(),
    email: z.string().email(),
    password: z.string().min(8),
    confirm_password: z.string().min(8),
  })
  .refine((d) => d.password === d.confirm_password, {
    path: ['confirm_password'],
    message: 'mismatch',
  });

type FormValues = z.infer<typeof schema>;

export function LabRegisterPage() {
  const { t, i18n } = useTranslation('auth');
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      lab_public_name: '',
      owner_first_name: '',
      owner_last_name: '',
      phone: '',
      email: '',
      password: '',
      confirm_password: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          role: 'LAB_MAIN_ADMIN',
          first_name: values.owner_first_name,
          last_name: values.owner_last_name,
          phone: values.phone || null,
          lab_public_name: values.lab_public_name,
          preferred_lang: (i18n.resolvedLanguage ?? 'en').slice(0, 2),
        },
      },
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    setSuccess(true);
  };

  if (success) {
    return (
      <PublicAuthLayout maxWidth="xs">
        <Stack spacing={1.5} alignItems="center" sx={{ textAlign: 'center', py: 1 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'success.main',
              color: '#fff',
            }}
          >
            <Icon name="check" size={30} />
          </Box>
          <Typography variant="h3" component="h1">
            {t('registrationSuccess.title')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('registrationSuccess.body')}
          </Typography>
          <Button variant="contained" onClick={() => navigate('/login')} sx={{ mt: 1 }}>
            {t('registrationSuccess.goToLogin')}
          </Button>
        </Stack>
      </PublicAuthLayout>
    );
  }

  const fmt = (msg: string | undefined): string | undefined => {
    if (!msg) return undefined;
    if (msg === 'mismatch') return t('register.doctor.passwordsDoNotMatch');
    return msg;
  };

  return (
    <PublicAuthLayout title={t('register.lab.title')} subtitle={t('register.lab.subtitle')}>
        <Stack spacing={2.5}>

            <Alert severity="info">{t('register.lab.infoNote')}</Alert>
            {serverError && <Alert severity="error">{serverError}</Alert>}

            <FormProvider {...methods}>
              <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
                <Stack spacing={2}>
                  <RHFTextField name="lab_public_name" label={t('register.lab.labPublicName')} required />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <RHFTextField
                      name="owner_first_name"
                      label={t('register.lab.ownerFirstName')}
                      required
                    />
                    <RHFTextField
                      name="owner_last_name"
                      label={t('register.lab.ownerLastName')}
                      required
                    />
                  </Stack>
                  <RHFTextField name="phone" label={t('register.lab.phone')} />
                  <RHFTextField
                    name="email"
                    type="email"
                    label={t('register.lab.email')}
                    autoComplete="email"
                    required
                  />
                  <RHFTextField
                    name="password"
                    type="password"
                    label={t('register.lab.password')}
                    autoComplete="new-password"
                    required
                  />
                  <RHFTextField
                    name="confirm_password"
                    type="password"
                    label={t('register.lab.confirmPassword')}
                    autoComplete="new-password"
                    helperText={fmt(methods.formState.errors.confirm_password?.message)}
                    required
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={methods.formState.isSubmitting}
                  >
                    {t('register.lab.submit')}
                  </Button>
                </Stack>
              </form>
            </FormProvider>

            <Typography variant="body2" color="text.secondary">
              {t('register.lab.haveAccount')}{' '}
              <Link component={RouterLink} to="/login">
                {t('register.lab.signIn')}
              </Link>
            </Typography>
          </Stack>
    </PublicAuthLayout>
  );
}
