import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
} from '@mui/material';
import { useEffect } from 'react';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { RHFTextField } from '@/components/RHFTextField';
import { workLocationSchema, type WorkLocationInput } from './schema';
import type { DoctorWorkLocationRow } from '@/types/database';

type Props = {
  open: boolean;
  initial?: DoctorWorkLocationRow | null;
  onClose: () => void;
  onSubmit: (values: WorkLocationInput) => Promise<void>;
};

const emptyValues: WorkLocationInput = {
  clinic_name: '',
  branch_name: '',
  address: '',
  city: '',
  clinic_identification_code: '',
  clinic_invoice_email: '',
  phone: '',
  is_default: false,
};

export function WorkLocationDialog({ open, initial, onClose, onSubmit }: Props) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const editing = !!initial;
  const methods = useForm<WorkLocationInput>({
    resolver: zodResolver(workLocationSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!open) return;
    methods.reset(
      initial
        ? {
            clinic_name: initial.clinic_name,
            branch_name: initial.branch_name ?? '',
            address: initial.address,
            city: initial.city,
            clinic_identification_code: initial.clinic_identification_code ?? '',
            clinic_invoice_email: initial.clinic_invoice_email ?? '',
            phone: initial.phone ?? '',
            is_default: initial.is_default,
          }
        : emptyValues,
    );
  }, [open, initial, methods]);

  const handleSubmit = async (values: WorkLocationInput) => {
    await onSubmit(values);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {editing ? t('workLocations.editDialog.title') : t('workLocations.createDialog.title')}
      </DialogTitle>
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(handleSubmit)} noValidate>
          <DialogContent dividers>
            <Stack spacing={2}>
              <RHFTextField name="clinic_name" label={t('workLocations.fields.clinicName')} />
              <RHFTextField name="branch_name" label={t('workLocations.fields.branchName')} />
              <RHFTextField name="address" label={t('workLocations.fields.address')} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <RHFTextField name="city" label={t('workLocations.fields.city')} />
                <RHFTextField name="phone" label={t('workLocations.fields.phone')} />
              </Stack>
              <RHFTextField
                name="clinic_identification_code"
                label={t('workLocations.fields.clinicIdentificationCode')}
                helperText={t('workLocations.fieldHelp.clinicIdentificationCode')}
              />
              <RHFTextField
                name="clinic_invoice_email"
                type="email"
                label={t('workLocations.fields.clinicInvoiceEmail')}
                helperText={t('workLocations.fieldHelp.clinicInvoiceEmail')}
              />
              <Controller
                name="is_default"
                control={methods.control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
                    }
                    label={t('workLocations.fields.isDefault')}
                  />
                )}
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
