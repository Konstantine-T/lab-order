import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { RHFTextField } from '@/components/RHFTextField';
import { useColorMode } from '@/theme/ColorModeProvider';
import { LANGUAGES } from '@/i18n';

const schema = z.object({
  first_name: z.string().min(2),
  last_name: z.string().min(2),
  phone: z.string().optional().or(z.literal('')),
  personal_id_number: z.string().regex(/^\d{11}$/),
  specialty: z.string().optional().or(z.literal('')),
  license_number: z.string().optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

export function DoctorProfilePage() {
  const { t, i18n } = useTranslation('doctor');
  const { user, refreshUser } = useAuth();
  const { pref, setPref } = useColorMode();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: '',
      last_name: '',
      phone: '',
      personal_id_number: '',
      specialty: '',
      license_number: '',
    },
  });

  useEffect(() => {
    if (!user) return;
    methods.reset({
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone ?? '',
      personal_id_number: user.doctor_profile?.personal_id_number ?? '',
      specialty: user.doctor_profile?.specialty ?? '',
      license_number: user.doctor_profile?.license_number ?? '',
    });
  }, [user, methods]);

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    setError(null);
    setSuccess(false);

    const userUpdate = supabase
      .from('users')
      .update({
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone || null,
      })
      .eq('id', user.id);

    const profileUpdate = supabase
      .from('doctor_profiles')
      .update({
        personal_id_number: values.personal_id_number,
        specialty: values.specialty || null,
        license_number: values.license_number || null,
      })
      .eq('user_id', user.id);

    const [{ error: e1 }, { error: e2 }] = await Promise.all([userUpdate, profileUpdate]);
    if (e1 || e2) {
      setError((e1 ?? e2)?.message ?? 'Save failed.');
      return;
    }
    setSuccess(true);
    await refreshUser();
  };

  const onLanguageChange = async (lang: string) => {
    if (!user) return;
    await i18n.changeLanguage(lang);
    await supabase.from('users').update({ preferred_lang: lang }).eq('id', user.id);
  };

  const onColorModeChange = async (mode: 'light' | 'dark' | 'system') => {
    if (!user) return;
    setPref(mode);
    await supabase.from('users').update({ preferred_color_mode: mode }).eq('id', user.id);
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <Typography variant="h4">{t('profile.title')}</Typography>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">{t('profile.personalInfo')}</Typography>
            {success && <Alert severity="success">{t('profile.saveSuccess')}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}

            <FormProvider {...methods}>
              <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <RHFTextField name="first_name" label={t('profile.firstName')} />
                    <RHFTextField name="last_name" label={t('profile.lastName')} />
                  </Stack>
                  <RHFTextField name="phone" label={t('profile.phone')} />
                  <RHFTextField
                    name="personal_id_number"
                    label={t('profile.personalIdNumber')}
                    inputProps={{ inputMode: 'numeric', maxLength: 11 }}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <RHFTextField name="specialty" label={t('profile.specialty')} />
                    <RHFTextField name="license_number" label={t('profile.licenseNumber')} />
                  </Stack>
                  <TextField
                    label={t('profile.email')}
                    value={user?.email ?? ''}
                    disabled
                    fullWidth
                  />
                  <Box>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={methods.formState.isSubmitting}
                    >
                      {methods.formState.isSubmitting ? '...' : 'Save'}
                    </Button>
                  </Box>
                </Stack>
              </form>
            </FormProvider>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">{t('profile.preferences')}</Typography>
            <Divider />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label={t('profile.language')}
                value={i18n.resolvedLanguage ?? 'en'}
                onChange={(e) => void onLanguageChange(e.target.value)}
                fullWidth
              >
                {LANGUAGES.map((l) => (
                  <MenuItem key={l.code} value={l.code}>
                    {l.flag} {l.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label={t('profile.colorMode')}
                value={pref}
                onChange={(e) =>
                  void onColorModeChange(e.target.value as 'light' | 'dark' | 'system')
                }
                fullWidth
              >
                <MenuItem value="light">{t('profile.modeOptions.light')}</MenuItem>
                <MenuItem value="dark">{t('profile.modeOptions.dark')}</MenuItem>
                <MenuItem value="system">{t('profile.modeOptions.system')}</MenuItem>
              </TextField>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
