import {
  Card,
  CardContent,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { RHFTextField } from '@/components/RHFTextField';
import type { ServiceBasicsInput } from './serviceBasicsSchema';

export function ServiceBasicsForm() {
  const { t } = useTranslation('lab');
  const { control } = useFormContext<ServiceBasicsInput>();

  return (
    <Card>
      <CardContent>
        <Stack spacing={2.5}>
          <Stack>
            <Typography variant="h6">{t('services.basics.title')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('services.basics.subtitle')}
            </Typography>
          </Stack>

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
      </CardContent>
    </Card>
  );
}
