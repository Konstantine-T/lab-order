import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { RHFTextField } from '@/components/RHFTextField';
import { Callout, Icon } from '@/components/design';
import type { GuestSaveStatus } from './guestDraft';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

/**
 * What a guest sees when they press Send on a complete order.
 *
 * The order is finished and only lacks an account, so the dialog offers the
 * two ways to get one without leaving the page's context: sign in here —
 * two fields, and staying on the order is the whole point — or go and
 * register, which has too many fields to belong in a modal.
 *
 * It does not navigate after a successful sign-in. The session lands, the
 * route guard around the guest wizard sees a doctor, and sends them to their
 * own wizard with the resume flag; the dialog is unmounted along the way.
 *
 * The draft is written before this opens, not after — `saveStatus` reports
 * how that went, because a guest whose storage is blocked (a private window,
 * a full disk) is about to leave the page believing their work is safe.
 */
export function GuestSubmitDialog({
  open,
  onClose,
  saveStatus,
}: {
  open: boolean;
  onClose: () => void;
  saveStatus: GuestSaveStatus;
}) {
  const { t } = useTranslation('common');
  const { t: ta } = useTranslation('auth');
  const { signIn } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      methods.reset({ email: '', password: '' });
    }
  }, [open, methods]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await signIn(values.email, values.password);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setServerError(msg || ta('login.invalidCredentials'));
    }
  };

  const saved = saveStatus === 'saved';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('guestSubmit.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body1" color="text.secondary">
            {t('guestSubmit.body')}
          </Typography>

          {/* Load-bearing, not polish: the draft holds the patient's name and
              date of birth, and this line is what tells someone on a shared
              clinic computer where that data now lives. */}
          {saved ? (
            <Callout tone="brand" icon="cloud_done">
              {t('guestSubmit.savedOnDevice')}
            </Callout>
          ) : (
            <Callout tone="warning" icon="cloud_off">
              {t('guestSubmit.notSaved')}
            </Callout>
          )}

          {serverError && <Alert severity="error">{serverError}</Alert>}

          <FormProvider {...methods}>
            <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
              <Stack spacing={1.75}>
                <RHFTextField
                  name="email"
                  type="email"
                  label={ta('login.email')}
                  autoComplete="email"
                  size="small"
                  required
                />
                <RHFTextField
                  name="password"
                  type="password"
                  label={ta('login.password')}
                  autoComplete="current-password"
                  size="small"
                  required
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  startIcon={<Icon name="login" size={18} />}
                  disabled={methods.formState.isSubmitting}
                >
                  {ta('login.submit')}
                </Button>
                <Link
                  component={RouterLink}
                  to="/forgot-password"
                  variant="body2"
                  sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
                >
                  {ta('login.forgotPassword')}
                </Link>
              </Stack>
            </form>
          </FormProvider>

          <Divider>
            <Typography variant="caption" color="text.secondary">
              {t('guestSubmit.or')}
            </Typography>
          </Divider>

          <Button
            component={RouterLink}
            to="/register/doctor"
            variant="outlined"
            size="large"
            startIcon={<Icon name="person_add" size={18} />}
          >
            {t('guestSubmit.register')}
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('actions.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
