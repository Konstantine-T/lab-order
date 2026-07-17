import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from '@mui/material';
import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { RHFTextField } from '@/components/RHFTextField';
import { staffSchema, type StaffInput } from './staffSchema';
import type { LabStaffRow } from '@/types/database';

type Props = {
  open: boolean;
  initial?: LabStaffRow | null;
  onClose: () => void;
  onSubmit: (values: StaffInput) => Promise<void>;
};

const emptyValues: StaffInput = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
};

export function StaffDialog({ open, initial, onClose, onSubmit }: Props) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const editing = !!initial;
  const methods = useForm<StaffInput>({
    resolver: zodResolver(staffSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!open) return;
    methods.reset(
      initial
        ? {
            first_name: initial.first_name,
            last_name: initial.last_name,
            phone: initial.phone,
            email: initial.email ?? '',
          }
        : emptyValues,
    );
  }, [open, initial, methods]);

  const handleSubmit = async (values: StaffInput) => {
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === '23505') {
        methods.setError('phone', { type: 'manual', message: t('staff.errors.duplicatePhone') });
      } else {
        methods.setError('root', { type: 'manual', message: tc('errors.saveFailed') });
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {editing ? t('staff.editDialog.title') : t('staff.createDialog.title')}
      </DialogTitle>
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(handleSubmit)} noValidate>
          <DialogContent dividers>
            <Stack spacing={2}>
              {methods.formState.errors.root && (
                <Alert severity="error">{methods.formState.errors.root.message}</Alert>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <RHFTextField name="first_name" label={t('staff.fields.firstName')} />
                <RHFTextField name="last_name" label={t('staff.fields.lastName')} />
              </Stack>
              <RHFTextField
                name="phone"
                label={t('staff.fields.phone')}
                helperText={t('staff.fieldHelp.phone')}
              />
              <RHFTextField
                name="email"
                type="email"
                label={t('staff.fields.email')}
                helperText={t('staff.fieldHelp.email')}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>{tc('actions.cancel')}</Button>
            <Button type="submit" variant="contained" disabled={methods.formState.isSubmitting}>
              {tc('actions.save')}
            </Button>
          </DialogActions>
        </form>
      </FormProvider>
    </Dialog>
  );
}
