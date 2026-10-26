import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CardStack, Icon, PageHeader, SectionCard } from '@/components/design';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { RHFTextField } from '@/components/RHFTextField';
import { MY_CLINIC_KEY, useMyClinics, type MyClinic } from '@/features/clinic/useMyClinic';
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

/**
 * The clinics the doctor belongs to (0050: any number), and what that means:
 * each sees the orders placed for it and can place and manage orders for the
 * doctor. Nothing while loading or when the read fails, so it never says "no
 * clinic" wrongly.
 *
 * "Leave" is `leave_clinic(id)`, behind a confirmation: the clinic can no
 * longer order for the doctor, the orders already placed for it stay its own,
 * and only a new invite brings the doctor back. Its admin is told (doctor_left).
 */
function ClinicCard() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const { data: clinics, isSuccess } = useMyClinics();
  const [leaving, setLeaving] = useState<MyClinic | null>(null);

  const leave = useMutation({
    mutationFn: async (clinicId: string) => {
      const { error } = await supabase.rpc('leave_clinic', { p_clinic_id: clinicId });
      if (error) throw error;
    },
    onSuccess: () => {
      setLeaving(null);
      void qc.invalidateQueries({ queryKey: MY_CLINIC_KEY });
    },
  });

  if (!isSuccess) return null;

  return (
    <SectionCard icon="apartment" title={t('profile.clinic.title')}>
      {clinics.length > 0 ? (
        <Stack spacing={1.5}>
          <Typography variant="body1" color="text.secondary">
            {t('profile.clinic.memberBody')}
          </Typography>
          {clinics.map((c) => (
            <Stack
              key={c.id}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ sm: 'center' }}
              justifyContent="space-between"
              sx={{ pt: 1.5, borderTop: 1, borderColor: 'divider' }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {c.name}
                </Typography>
                {(c.workingAddress || c.city) && (
                  <Typography variant="body1" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                    {[c.workingAddress, c.city].filter(Boolean).join(', ')}
                  </Typography>
                )}
              </Box>
              <Box sx={{ flexShrink: 0 }}>
                <Button
                  size="small"
                  color="error"
                  startIcon={<Icon name="logout" size={16} />}
                  onClick={() => setLeaving(c)}
                >
                  {t('profile.clinic.leave')}
                </Button>
              </Box>
            </Stack>
          ))}

          <Dialog
            open={!!leaving}
            onClose={() => !leave.isPending && setLeaving(null)}
            maxWidth="xs"
            fullWidth
            TransitionProps={{ onExited: () => leave.reset() }}
          >
            <DialogTitle>{t('profile.clinic.leaveTitle', { clinic: leaving?.name ?? '' })}</DialogTitle>
            <DialogContent>
              <DialogContentText>{t('profile.clinic.leaveBody')}</DialogContentText>
              {leave.isError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {tc('errors.generic')}
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setLeaving(null)} disabled={leave.isPending}>
                {tc('actions.cancel')}
              </Button>
              <Button
                variant="contained"
                color="error"
                disabled={leave.isPending || !leaving}
                onClick={() => leaving && leave.mutate(leaving.id)}
              >
                {t('profile.clinic.leaveConfirm')}
              </Button>
            </DialogActions>
          </Dialog>
        </Stack>
      ) : (
        <Stack spacing={0.5}>
          <Typography sx={{ fontWeight: 600 }}>{t('profile.clinic.none')}</Typography>
          <Typography variant="body1" color="text.secondary">
            {t('profile.clinic.noneHint')}
          </Typography>
        </Stack>
      )}
    </SectionCard>
  );
}

export function DoctorProfilePage() {
  const { t, i18n } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
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
    <>
      <PageHeader title={t('profile.title')} />

      <CardStack sx={{ maxWidth: 760 }}>
        <SectionCard icon="person" title={t('profile.personalInfo')}>
          <Stack spacing={2}>
            {success && <Alert severity="success">{t('profile.saveSuccess')}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}

            <FormProvider {...methods}>
              <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <RHFTextField name="first_name" label={t('profile.firstName')} required />
                    <RHFTextField name="last_name" label={t('profile.lastName')} required />
                  </Stack>
                  <RHFTextField name="phone" label={t('profile.phone')} />
                  <RHFTextField
                    name="personal_id_number"
                    label={t('profile.personalIdNumber')}
                    inputProps={{ inputMode: 'numeric', maxLength: 11 }}
                    required
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
                      {methods.formState.isSubmitting ? tc('actions.saving') : tc('actions.save')}
                    </Button>
                  </Box>
                </Stack>
              </form>
            </FormProvider>
          </Stack>
        </SectionCard>

        <ClinicCard />

        <SectionCard icon="tune" title={t('profile.preferences')}>
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
        </SectionCard>
      </CardStack>
    </>
  );
}
