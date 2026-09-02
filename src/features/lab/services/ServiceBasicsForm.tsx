import { Stack } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { RHFTextField } from '@/components/RHFTextField';
import { SectionCard } from '@/components/design';
import { ServiceImageField } from './ServiceImageField';

export function ServiceBasicsForm() {
  const { t } = useTranslation('lab');

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
          {/* Active lives on the service card in the list now, where you can
              see every service's state at once and flip one without opening a
              form. `is_active` stays in the form's values so a save round-trips
              whatever the card last set. */}
          <ServiceImageField />
        </Stack>
    </SectionCard>
  );
}
