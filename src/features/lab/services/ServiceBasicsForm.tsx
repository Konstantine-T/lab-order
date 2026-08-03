import { FormControlLabel, Stack, Switch } from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { RHFTextField } from '@/components/RHFTextField';
import { SectionCard } from '@/components/design';
import type { ServiceBasicsInput } from './serviceBasicsSchema';

export function ServiceBasicsForm() {
  const { t } = useTranslation('lab');
  const { control } = useFormContext<ServiceBasicsInput>();

  return (
    <SectionCard
      icon="edit_note"
      title={t('services.basics.title')}
      meta={t('services.basics.subtitle')}
    >
        <Stack spacing={2.5}>
          <RHFTextField name="name" label={t('services.fields.name')} required />
          <RHFTextField
            name="short_description"
            label={t('services.fields.shortDescription')}
            multiline
            minRows={2}
          />
          <RHFTextField
            name="average_turnaround_days"
            type="number"
            label={t('services.fields.averageTurnaroundDays')}
            required
            inputProps={{ min: 1 }}
          />
          <RHFTextField name="cover_image_url" label={t('services.fields.coverImageUrl')} />

          <Controller
            name="is_active"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Switch
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                }
                label={t('services.fields.isActive')}
                sx={{ alignSelf: 'flex-start' }}
              />
            )}
          />
        </Stack>
    </SectionCard>
  );
}
