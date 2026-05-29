import { Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { NumberedSection, PillGroup, ErrorHelper } from './primitives';
import {
  emptyModelAnswers,
  coerceModelAnswers,
  validateModel,
  isModelFieldEnabled,
  isModelFieldRequired,
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
  configuration,
  pricing: _pricing,
  value,
  onChange,
  readOnly,
  showErrors,
}: Props) {
  const { t } = useTranslation('lab');
  const a = value;
  const errors: ModelErrors = showErrors ? validateModel(a, configuration) : {};

  const set = (patch: Partial<ModelAnswers>) => onChange({ ...a, ...patch });
  const mf = (k: string) => t(`modelForm.${k}`);
  const opt = (ns: string, v: string) => t(`modelForm.${ns}.${v}`, { defaultValue: v });

  const enabled = (code: Parameters<typeof isModelFieldEnabled>[1]) =>
    isModelFieldEnabled(configuration, code);
  const req = (code: Parameters<typeof isModelFieldRequired>[1]) =>
    isModelFieldRequired(configuration, code);
  const star = (code: Parameters<typeof req>[0]) => (req(code) ? ' *' : '');

  let counter = 0;
  const next = () => ++counter;

  return (
    <Stack spacing={4}>
      {enabled('model_type') && (
        <NumberedSection
          number={next()}
          label={`${mf('modelType.label')}${star('model_type')}`}
        >
          <PillGroup<ModelType>
            value={a.modelType}
            options={['BASE_MODEL', 'IMPLANT_MODEL', 'ORTHO_MODEL']}
            getLabel={(o) => opt('modelType', o)}
            onChange={(v) => set({ modelType: v })}
            readOnly={readOnly}
            allowDeselect={!req('model_type')}
          />
          <ErrorHelper>{errors.modelType}</ErrorHelper>
        </NumberedSection>
      )}

      {enabled('model_articulator') && (
        <NumberedSection
          number={next()}
          label={`${mf('articulatorAlignment.label')}${star('model_articulator')}`}
        >
          <PillGroup<'YES' | 'NO'>
            value={a.articulatorAlignment}
            options={['YES', 'NO']}
            getLabel={(o) => t(`modelForm.yesNo.${o}`)}
            onChange={(v) => set({ articulatorAlignment: v })}
            readOnly={readOnly}
            allowDeselect={!req('model_articulator')}
          />
          <ErrorHelper>{errors.articulatorAlignment}</ErrorHelper>
        </NumberedSection>
      )}

      {enabled('model_arch') && (
        <NumberedSection
          number={next()}
          label={`${mf('arch.label')}${star('model_arch')}`}
        >
          <PillGroup<ModelArch>
            value={a.arch}
            options={['UPPER', 'LOWER', 'BOTH']}
            getLabel={(o) => opt('arch', o)}
            onChange={(v) => set({ arch: v })}
            readOnly={readOnly}
            allowDeselect={!req('model_arch')}
          />
          <ErrorHelper>{errors.arch}</ErrorHelper>
        </NumberedSection>
      )}

      {enabled('model_markings') && (
        <NumberedSection
          number={next()}
          label={`${mf('markings.label')}${star('model_markings')}`}
        >
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
      )}

      {enabled('model_base_type') && (
        <NumberedSection
          number={next()}
          label={`${mf('baseType.label')}${star('model_base_type')}`}
        >
          <PillGroup<ModelBaseType>
            value={a.baseType}
            options={['HOLLOW', 'SOLID']}
            getLabel={(o) => opt('baseType', o)}
            onChange={(v) => set({ baseType: v })}
            readOnly={readOnly}
            allowDeselect={!req('model_base_type')}
          />
          <ErrorHelper>{errors.baseType}</ErrorHelper>
        </NumberedSection>
      )}

      {enabled('model_prepared_dies') && (
        <NumberedSection
          number={next()}
          label={`${mf('preparedDies.label')}${star('model_prepared_dies')}`}
        >
          <PillGroup<'YES' | 'NO'>
            value={a.preparedDies}
            options={['YES', 'NO']}
            getLabel={(o) => t(`modelForm.yesNo.${o}`)}
            onChange={(v) => set({ preparedDies: v })}
            readOnly={readOnly}
            allowDeselect={!req('model_prepared_dies')}
          />
          <ErrorHelper>{errors.preparedDies}</ErrorHelper>
        </NumberedSection>
      )}

      {enabled('model_notes') && (
        <NumberedSection
          number={next()}
          label={`${mf('notes.label')}${star('model_notes')}`}
        >
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
      )}
    </Stack>
  );
}
