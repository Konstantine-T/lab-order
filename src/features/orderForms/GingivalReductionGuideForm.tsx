import { Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ToothMap } from '@/components/ToothMap';
import { NumberedSection, PillGroup, ErrorHelper, CustomQuestionSections } from './primitives';
import {
  emptyGrgAnswers,
  coerceGrgAnswers,
  validateGrg,
  isGrgFieldEnabled,
  isGrgFieldRequired,
  type GrgAnswers,
  type GrgErrors,
} from './grgTypes';
import type { FormConfiguration, PricingConfig } from '@/types/database';

export { coerceGrgAnswers, validateGrg, emptyGrgAnswers };
export type { GrgAnswers, GrgErrors };

type Props = {
  configuration: FormConfiguration;
  pricing?: PricingConfig;
  value: GrgAnswers;
  onChange: (next: GrgAnswers) => void;
  readOnly?: boolean;
  showErrors?: boolean;
  /**
   * The flat answer record, for the lab's own appended questions. Separate
   * from `value`, which is this template's typed answer shape — the custom
   * questions live outside it.
   */
  rawValues?: Record<string, unknown>;
  onRawChange?: (next: Record<string, unknown>) => void;
  /** Validation errors for those custom questions, keyed by field code. */
  customErrors?: Record<string, string>;
};

export function GingivalReductionGuideForm({
  configuration,
  pricing: _pricing,
  value,
  onChange,
  readOnly,
  showErrors,
  rawValues,
  onRawChange,
  customErrors,
}: Props) {
  const { t } = useTranslation('lab');
  const a = value;
  const errors: GrgErrors = showErrors ? validateGrg(a, configuration) : {};

  const set = (patch: Partial<GrgAnswers>) => onChange({ ...a, ...patch });
  const f = (k: string) => t(`grgForm.${k}`);

  const enabled = (code: Parameters<typeof isGrgFieldEnabled>[1]) =>
    isGrgFieldEnabled(configuration, code);
  const req = (code: Parameters<typeof isGrgFieldRequired>[1]) =>
    isGrgFieldRequired(configuration, code);
  const star = (code: Parameters<typeof req>[0]) => (req(code) ? ' *' : '');

  let counter = 0;
  const next = () => ++counter;

  return (
    <Stack spacing={4}>
      {enabled('grg_teeth') && (
        <NumberedSection
          number={next()}
          label={`${f('teeth.label')}${star('grg_teeth')}`}
        >
          <ToothMap
            value={a.teeth}
            onChange={readOnly ? undefined : (v) => set({ teeth: v })}
            readOnly={readOnly}
          />
          <ErrorHelper>{errors.teeth}</ErrorHelper>
        </NumberedSection>
      )}

      {enabled('grg_additive_wax_up') && (
        <NumberedSection
          number={next()}
          label={`${f('additiveWaxUp.label')}${star('grg_additive_wax_up')}`}
        >
          <PillGroup<'YES' | 'NO'>
            value={a.additiveWaxUp}
            options={['YES', 'NO']}
            getLabel={(o) => t(`grgForm.yesNo.${o}`)}
            onChange={(v) => set({ additiveWaxUp: v })}
            readOnly={readOnly}
            allowDeselect={!req('grg_additive_wax_up')}
          />
          <ErrorHelper>{errors.additiveWaxUp}</ErrorHelper>
        </NumberedSection>
      )}

      {enabled('grg_approval_needed') && (
        <NumberedSection
          number={next()}
          label={`${f('approvalNeeded.label')}${star('grg_approval_needed')}`}
        >
          <PillGroup<'YES' | 'NO'>
            value={a.approvalNeeded}
            options={['YES', 'NO']}
            getLabel={(o) => t(`grgForm.yesNo.${o}`)}
            onChange={(v) => set({ approvalNeeded: v })}
            readOnly={readOnly}
            allowDeselect={!req('grg_approval_needed')}
          />
          <ErrorHelper>{errors.approvalNeeded}</ErrorHelper>
        </NumberedSection>
      )}

      {enabled('grg_notes') && (
        <NumberedSection
          number={next()}
          label={`${f('notes.label')}${star('grg_notes')}`}
        >
          <TextField
            fullWidth
            multiline
            minRows={3}
            placeholder={f('notes.placeholder')}
            value={a.notes}
            onChange={(e) => set({ notes: e.target.value })}
            InputProps={{ readOnly: !!readOnly }}
          />
        </NumberedSection>
      )}

      {/* The lab's own questions, numbered by the same counter as the sections
          above so they read as equals rather than a footnote. */}
      {rawValues && onRawChange && (
        <CustomQuestionSections
          configuration={configuration}
          values={rawValues}
          onChange={onRawChange}
          readOnly={readOnly}
          errors={customErrors}
          startNumber={counter}
        />
      )}

    </Stack>
  );
}
