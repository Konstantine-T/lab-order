import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { PublicAuthLayout } from '@/layouts/PublicAuthLayout';
import { RHFTextField } from '@/components/RHFTextField';
import { supabase } from '@/lib/supabase';

const schema = z
  .object({
    password: z.string().min(8),
    confirm_password: z.string().min(8),
  })
  .refine((d) => d.password === d.confirm_password, {
    path: ['confirm_password'],
    message: 'mismatch',
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm_password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setServerError(error.message);
      return;
    }
    setSuccess(true);
    setTimeout(() => navigate('/login'), 1500);
  };

  return (
    <PublicAuthLayout>
      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Typography variant="h4">{t('resetPassword.title')}</Typography>
            {success && <Alert severity="success">{t('resetPassword.success')}</Alert>}
            {serverError && <Alert severity="error">{serverError}</Alert>}
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
          </Stack>
        </CardContent>
      </Card>
    </PublicAuthLayout>
  );
}
