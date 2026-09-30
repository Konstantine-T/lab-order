import { useEffect, useState } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { SectionCard } from '@/components/design';
import { RHFTextField } from '@/components/RHFTextField';
import { clearNotice, leaveNotice, readNotice } from './remountNotice';

// The same rules as the doctor's own profile (DoctorProfilePage).
const schema = z.object({
  first_name: z.string().trim().min(2),
  last_name: z.string().trim().min(2),
  phone: z.string().optional().or(z.literal('')),
});
type AccountInput = z.infer<typeof schema>;

const NOTICE = 'lab-account-saved';

/**
 * The signed-in person's own details — the name and phone they registered
 * with — as opposed to the laboratory's. Writes `public.users` through the
 * `users_update_self` policy (0004); 0017's trigger keeps role, status and
 * email out of reach, so email is shown read-only.
 *
 * Its own form, placed outside the lab profile's <form>: a nested form would
 * submit the outer one, and this must not inherit the lab's approval lock —
 * fixing a typo in your own name needs no admin review.
 */
export function LabAccountCard() {
  const { t } = useTranslation('lab');
  const { t: ta } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const { user, refreshUser } = useAuth();

  // Survives the re-mount `refreshUser()` causes (see remountNotice).
  const [saved, setSaved] = useState(() => readNotice(NOTICE) !== null);
  const [failed, setFailed] = useState(false);

  const methods = useForm<AccountInput>({
    resolver: zodResolver(schema),
    defaultValues: { first_name: '', last_name: '', phone: '' },
  });

  useEffect(() => {
    if (!user) return;
    methods.reset({
      first_name: user.first_name ?? '',
      last_name: user.last_name ?? '',
      phone: user.phone ?? '',
    });
  }, [user, methods]);

  if (!user) return null;

  const onSubmit = async (values: AccountInput) => {
    setSaved(false);
    setFailed(false);
    clearNotice(NOTICE);
    const { error } = await supabase
      .from('users')
      .update({
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone?.trim() || null,
      })
      .eq('id', user.id);
    if (error) {
      setFailed(true);
      return;
    }
    leaveNotice(NOTICE, 'saved');
    setSaved(true);
    // The sidebar and the account menu read the cached AppUser.
    await refreshUser();
  };

  return (
    <SectionCard icon="person" title={t('profile.sections.account')}>
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {t('profile.account.hint')}
            </Typography>
            {saved && <Alert severity="success">{t('profile.account.saved')}</Alert>}
            {failed && <Alert severity="error">{t('profile.account.saveFailed')}</Alert>}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <RHFTextField
                name="first_name"
                label={ta('register.lab.ownerFirstName')}
                autoComplete="given-name"
                required
              />
              <RHFTextField
                name="last_name"
                label={ta('register.lab.ownerLastName')}
                autoComplete="family-name"
                required
              />
            </Stack>
            <RHFTextField
              name="phone"
              label={ta('register.lab.phone')}
              type="tel"
              autoComplete="tel"
            />
            <TextField
              label={ta('register.lab.email')}
              value={user.email ?? ''}
              fullWidth
              disabled
              helperText={t('profile.account.emailReadOnly')}
            />
            <Box>
              <Button
                type="submit"
                variant="outlined"
                disabled={methods.formState.isSubmitting}
              >
                {methods.formState.isSubmitting ? tc('actions.saving') : tc('actions.save')}
              </Button>
            </Box>
          </Stack>
        </form>
      </FormProvider>
    </SectionCard>
  );
}
