import { Alert, MenuItem, Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { NumberedSection, ErrorHelper } from './primitives';
import { NumberField } from '@/components/NumberField';
import { ToothMap } from '@/components/ToothMap';
import { formatGEL } from '@/utils/pricing';
import type { MaterialOption, PricingConfig } from '@/types/database';
import {
  validatePrint,
  type PrintAnswers,
  validateMilling,
  type MillingAnswers,
} from './fabTypes';

function MaterialSelect({
  materials,
  value,
  onChange,
  readOnly,
  error,
  label,
  unitLabel,
}: {
  materials: MaterialOption[];
  value: string;
  onChange: (id: string) => void;
  readOnly?: boolean;
  error?: string;
  label: string;
  unitLabel: string;
}) {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={!!error}
      helperText={error}
      InputProps={{ readOnly: !!readOnly }}
      sx={{ maxWidth: 440 }}
      fullWidth
    >
      {materials.map((m) => (
        <MenuItem key={m.id} value={m.id}>
          {m.name}
          {m.unit_price ? ` — ${formatGEL(m.unit_price)}/${unitLabel}` : ''}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function PrintForm({
  pricing,
  value,
  onChange,
  readOnly,
  showErrors,
}: {
  pricing?: PricingConfig;
  value: PrintAnswers;
  onChange: (next: PrintAnswers) => void;
  readOnly?: boolean;
  showErrors?: boolean;
}) {
  const { t } = useTranslation('lab');
  const errors = showErrors ? validatePrint(value) : {};
  const materials = pricing?.materials ?? [];
  const set = (patch: Partial<PrintAnswers>) => onChange({ ...value, ...patch });

  if (materials.length === 0) {
    return <Alert severity="warning">{t('fabForm.noMaterials')}</Alert>;
  }

  return (
    <Stack spacing={4}>
      <NumberedSection number={1} label={`${t('fabForm.material')} *`}>
        <MaterialSelect
          materials={materials}
          value={value.materialId}
          onChange={(id) => set({ materialId: id })}
          readOnly={readOnly}
          error={errors.materialId}
          label={t('fabForm.material')}
          unitLabel={t('fabForm.unit')}
        />
      </NumberedSection>
      <NumberedSection number={2} label={`${t('fabForm.units')} *`}>
        <NumberField
          label={t('fabForm.units')}
          value={value.units ?? undefined}
          onChange={(u) => set({ units: u ?? null })}
          min={1}
          error={!!errors.units}
          helperText={errors.units}
          InputProps={{ readOnly: !!readOnly }}
          sx={{ maxWidth: 200 }}
        />
      </NumberedSection>
      <NumberedSection number={3} label={t('fabForm.notes')}>
        <TextField
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          multiline
          minRows={2}
          fullWidth
          InputProps={{ readOnly: !!readOnly }}
        />
      </NumberedSection>
    </Stack>
  );
}

export function MillingForm({
  pricing,
  value,
  onChange,
  readOnly,
  showErrors,
}: {
  pricing?: PricingConfig;
  value: MillingAnswers;
  onChange: (next: MillingAnswers) => void;
  readOnly?: boolean;
  showErrors?: boolean;
}) {
  const { t } = useTranslation('lab');
  const errors = showErrors ? validateMilling(value) : {};
  const materials = pricing?.materials ?? [];
  const set = (patch: Partial<MillingAnswers>) => onChange({ ...value, ...patch });

  if (materials.length === 0) {
    return <Alert severity="warning">{t('fabForm.noMaterials')}</Alert>;
  }

  return (
    <Stack spacing={4}>
      <NumberedSection number={1} label={`${t('fabForm.material')} *`}>
        <MaterialSelect
          materials={materials}
          value={value.materialId}
          onChange={(id) => set({ materialId: id })}
          readOnly={readOnly}
          error={errors.materialId}
          label={t('fabForm.material')}
          unitLabel={t('fabForm.unit')}
        />
      </NumberedSection>
      <NumberedSection
        number={2}
        label={`${t('fabForm.teeth')} *`}
        hint={t('fabForm.teethCount', { count: value.teeth.length })}
      >
        <ToothMap
          value={value.teeth}
          onChange={readOnly ? undefined : (teeth) => set({ teeth })}
          readOnly={readOnly}
        />
        <ErrorHelper>{errors.teeth}</ErrorHelper>
      </NumberedSection>
      <NumberedSection number={3} label={t('fabForm.notes')}>
        <TextField
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          multiline
          minRows={2}
          fullWidth
          InputProps={{ readOnly: !!readOnly }}
        />
      </NumberedSection>
    </Stack>
  );
}
