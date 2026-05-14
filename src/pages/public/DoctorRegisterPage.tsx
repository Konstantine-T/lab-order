import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
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
import { RHFTextField } from '@/components/RHFTextField';
import { supabase } from '@/lib/supabase';

const schema = z
  .object({
    first_name: z.string().min(2),
    last_name: z.string().min(2),
    personal_id_number: z.string().regex(/^\d{11}$/, { message: 'invalid_pid' }),
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

export function DoctorRegisterPage() {
  const { t, i18n } = useTranslation('auth');
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: '',
      last_name: '',
      personal_id_number: '',
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
          role: 'DOCTOR',
          first_name: values.first_name,
          last_name: values.last_name,
          phone: values.phone || null,
          personal_id_number: values.personal_id_number,
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
      <PublicAuthLayout>
        <Card>
          <CardContent>
            <Stack spacing={3} alignItems="flex-start">
              <Typography variant="h4">{t('registrationSuccess.title')}</Typography>
              <Typography color="text.secondary">{t('registrationSuccess.body')}</Typography>
              <Button variant="contained" onClick={() => navigate('/login')}>
                {t('registrationSuccess.goToLogin')}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </PublicAuthLayout>
    );
  }

  // Translate Zod custom error messages.
  const fmt = (msg: string | undefined): string | undefined => {
    if (!msg) return undefined;
    if (msg === 'invalid_pid') return t('validation.personalIdFormat');
    if (msg === 'mismatch') return t('register.doctor.passwordsDoNotMatch');
    return msg;
  };

  return (
    <PublicAuthLayout>
      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Stack spacing={0.5}>
              <Typography variant="h4">{t('register.doctor.title')}</Typography>
              <Typography color="text.secondary">{t('register.doctor.subtitle')}</Typography>
            </Stack>

            {serverError && <Alert severity="error">{serverError}</Alert>}

            <FormProvider {...methods}>
              <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <RHFTextField name="first_name" label={t('register.doctor.firstName')} />
                    <RHFTextField name="last_name" label={t('register.doctor.lastName')} />
                  </Stack>
                  <RHFTextField
                    name="personal_id_number"
                    label={t('register.doctor.personalIdNumber')}
                    helperText={fmt(methods.formState.errors.personal_id_number?.message) ?? t('register.doctor.personalIdHelp')}
                    inputProps={{ inputMode: 'numeric', maxLength: 11 }}
                  />
                  <RHFTextField name="phone" label={t('register.doctor.phone')} />
                  <RHFTextField
                    name="email"
                    type="email"
                    label={t('register.doctor.email')}
                    autoComplete="email"
                  />
                  <RHFTextField
                    name="password"
                    type="password"
                    label={t('register.doctor.password')}
                    autoComplete="new-password"
                  />
                  <RHFTextField
                    name="confirm_password"
                    type="password"
                    label={t('register.doctor.confirmPassword')}
                    autoComplete="new-password"
                    helperText={fmt(methods.formState.errors.confirm_password?.message)}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={methods.formState.isSubmitting}
                  >
                    {t('register.doctor.submit')}
                  </Button>
                </Stack>
              </form>
            </FormProvider>

            <Typography variant="body2" color="text.secondary">
              {t('register.doctor.haveAccount')}{' '}
              <Link component={RouterLink} to="/login">
                {t('register.doctor.signIn')}
              </Link>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </PublicAuthLayout>
  );
}
