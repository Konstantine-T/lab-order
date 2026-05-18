import { Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { NumberedSection, PillGroup, ErrorHelper } from './primitives';
import {
  emptyModelAnswers,
  coerceModelAnswers,
  validateModel,
  type ModelAnswers,
  type ModelType,
  type ModelArch,
  type ModelBaseType,
  type ModelErrors,
} from './modelTypes';
import type { FormConfiguration, PricingConfig } from '@/types/database';

export { coerceModelAnswers, validateModel, emptyModelAnswers };
export type { ModelAnswers, ModelErrors };

type Props = {
  configuration: FormConfiguration;
  pricing?: PricingConfig;
  value: ModelAnswers;
  onChange: (next: ModelAnswers) => void;
  readOnly?: boolean;
  showErrors?: boolean;
};

export function ModelForm({
  configuration: _configuration,
  pricing: _pricing,
  value,
  onChange,
  readOnly,
  showErrors,
}: Props) {
  const { t } = useTranslation('lab');
  const a = value;
  const errors: ModelErrors = showErrors ? validateModel(a) : {};

  const set = (patch: Partial<ModelAnswers>) => onChange({ ...a, ...patch });
  const mf = (k: string) => t(`modelForm.${k}`);
  const opt = (ns: string, v: string) => t(`modelForm.${ns}.${v}`, { defaultValue: v });

  let counter = 0;
  const next = () => ++counter;

  return (
    <Stack spacing={4}>
      {/* 1. Type of model */}
      <NumberedSection number={next()} label={mf('modelType.label')}>
        <PillGroup<ModelType>
          value={a.modelType}
          options={['BASE_MODEL', 'IMPLANT_MODEL', 'ORTHO_MODEL']}
          getLabel={(o) => opt('modelType', o)}
          onChange={(v) => set({ modelType: v })}
          readOnly={readOnly}
        />
        <ErrorHelper>{errors.modelType}</ErrorHelper>
      </NumberedSection>

      {/* 2. Alignment on semi-adjustable articulator */}
      <NumberedSection number={next()} label={mf('articulatorAlignment.label')}>
        <PillGroup<'YES' | 'NO'>
          value={a.articulatorAlignment}
          options={['YES', 'NO']}
          getLabel={(o) => t(`modelForm.yesNo.${o}`)}
          onChange={(v) => set({ articulatorAlignment: v })}
          readOnly={readOnly}
        />
        <ErrorHelper>{errors.articulatorAlignment}</ErrorHelper>
      </NumberedSection>

      {/* 3. Arch */}
      <NumberedSection number={next()} label={mf('arch.label')}>
        <PillGroup<ModelArch>
          value={a.arch}
          options={['UPPER', 'LOWER', 'BOTH']}
          getLabel={(o) => opt('arch', o)}
          onChange={(v) => set({ arch: v })}
          readOnly={readOnly}
        />
        <ErrorHelper>{errors.arch}</ErrorHelper>
      </NumberedSection>

      {/* 4. Markings */}
      <NumberedSection number={next()} label={mf('markings.label')}>
        <TextField
          fullWidth
          multiline
          minRows={2}
          placeholder={mf('markings.placeholder')}
          value={a.markings}
          onChange={(e) => set({ markings: e.target.value })}
          InputProps={{ readOnly: !!readOnly }}
        />
      </NumberedSection>

      {/* 5. Type of base */}
      <NumberedSection number={next()} label={mf('baseType.label')}>
        <PillGroup<ModelBaseType>
          value={a.baseType}
          options={['HOLLOW', 'SOLID']}
          getLabel={(o) => opt('baseType', o)}
          onChange={(v) => set({ baseType: v })}
          readOnly={readOnly}
        />
        <ErrorHelper>{errors.baseType}</ErrorHelper>
      </NumberedSection>

      {/* 6. Prepared dies */}
      <NumberedSection number={next()} label={mf('preparedDies.label')}>
        <PillGroup<'YES' | 'NO'>
          value={a.preparedDies}
          options={['YES', 'NO']}
          getLabel={(o) => t(`modelForm.yesNo.${o}`)}
          onChange={(v) => set({ preparedDies: v })}
          readOnly={readOnly}
        />
        <ErrorHelper>{errors.preparedDies}</ErrorHelper>
      </NumberedSection>

      {/* 7. Notes */}
      <NumberedSection number={next()} label={mf('notes.label')}>
        <TextField
          fullWidth
          multiline
          minRows={3}
          placeholder={mf('notes.placeholder')}
          value={a.notes}
          onChange={(e) => set({ notes: e.target.value })}
          InputProps={{ readOnly: !!readOnly }}
        />
      </NumberedSection>
    </Stack>
  );
}
