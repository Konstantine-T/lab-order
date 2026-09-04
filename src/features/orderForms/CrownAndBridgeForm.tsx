import { useState } from 'react';
import type { ReactNode } from 'react';
import { Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ShadePicker } from '@/components/ShadePicker';
import { NumberedSection, PillGroup, MmInput, ErrorHelper, CustomQuestionSections } from './primitives';
import { TreatmentBuilder } from './TreatmentBuilder';
import {
  SHADE_SCALES,
  shadeGroupsForScale,
  coerceCnbAnswers,
  validateCnb,
  isSectionEnabled,
  isSectionRequired,
  type CnbAnswers,
  type CnbErrors,
  type CnbSectionCode,
} from './cnbTypes';
import type { FormConfiguration, PricingConfig } from '@/types/database';

type Props = {
  configuration: FormConfiguration;
  /** Required for Crown & Bridge — drives the materials chip group and price. */
  pricing?: PricingConfig;
  value: CnbAnswers;
  onChange: (next: CnbAnswers) => void;
  readOnly?: boolean;
  /** When true, validation errors are surfaced inline (red borders / helpers). */
  showErrors?: boolean;
  /** Teeth to display with a filled dot marker (e.g. implant positions on an implant order). */
  markedTeeth?: number[];
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

export { coerceCnbAnswers, validateCnb };
export type { CnbAnswers, CnbErrors };

export function CrownAndBridgeForm({
  configuration,
  pricing,
  value,
  onChange,
  readOnly,
  showErrors,
  markedTeeth,
  rawValues,
  onRawChange,
  customErrors,
}: Props) {
  const { t } = useTranslation('lab');
  const errors: CnbErrors = showErrors ? validateCnb(value, configuration) : {};
  const set = (patch: Partial<CnbAnswers>) => onChange({ ...value, ...patch });
  const enabled = (code: CnbSectionCode) => isSectionEnabled(configuration, code);
  const req = (code: CnbSectionCode) => isSectionRequired(configuration, code);
  const star = (code: CnbSectionCode) => (req(code) ? ' *' : '');
  const label = (code: CnbSectionCode) => `${t(`cnbForm.sections.${code}`)}${star(code)}`;
  // Translate pill option labels (canonical English value → localized display).
  const optLabel = (opt: string) => t(`cnbForm.options.${opt}`, { defaultValue: opt });

  const materials = pricing?.materials ?? [];
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);

  // Renumber visible sections so the badge always shows 1..N (no holes).
  let counter = 0;
  const next = () => ++counter;

  return (
    <Stack spacing={4}>
      {enabled('treatments') && (
        <NumberedSection number={next()} label={label('treatments')}>
          <TreatmentBuilder
            materials={materials}
            toothAssignments={value.toothAssignments}
            notation={value.notation}
            notes={value.notes}
            selectedMaterialId={selectedMaterialId}
            onSelectMaterial={setSelectedMaterialId}
            onAssignmentsChange={(toothAssignments) => set({ toothAssignments })}
            onNotationChange={(notation) => set({ notation })}
            onNotesChange={(notes) => set({ notes })}
            readOnly={readOnly}
            error={errors.treatments}
            markedTeeth={markedTeeth}
          />
        </NumberedSection>
      )}

      {enabled('shade') && (
        <NumberedSection number={next()} label={label('shade')}>
          <Stack spacing={1.5}>
            <PillGroup
              value={value.shadeScale}
              options={SHADE_SCALES}
              getLabel={(s) => t(`cnbForm.shadeScales.${s}`, { defaultValue: s })}
              onChange={(scale) => set({ shadeScale: scale, shade: '' })}
              readOnly={readOnly}
              size="small"
            />
            <ShadePicker
              value={value.shade}
              onChange={(shade) => set({ shade })}
              readOnly={readOnly}
              groups={shadeGroupsForScale(value.shadeScale)}
            />
            <TextField
              value={value.shadeNotes}
              onChange={(e) => set({ shadeNotes: e.target.value })}
              placeholder={t('cnbForm.shadeNotesPlaceholder')}
              multiline
              minRows={2}
              fullWidth
              InputProps={{ readOnly: !!readOnly }}
              sx={{ maxWidth: 520 }}
            />
          </Stack>
          <ErrorHelper>{errors.shade}</ErrorHelper>
        </NumberedSection>
      )}

      {enabled('gingivalContouring') && (
        <NumberedSection number={next()} label={label('gingivalContouring')}>
          <ConditionalRow
            mainError={errors.gingivalContouring}
            mmError={errors.gingivalContouringMm}
          >
            <PillGroup
              value={value.gingivalContouring.choice}
              onChange={(choice) =>
                set({
                  gingivalContouring: {
                    choice,
                    desiredLengthMm:
                      choice === 'Yes' ? value.gingivalContouring.desiredLengthMm : null,
                  },
                })
              }
              options={['Yes', 'No'] as const}
              getLabel={optLabel}
              readOnly={readOnly}
              allowDeselect={!req('gingivalContouring')}
            />
            {value.gingivalContouring.choice === 'Yes' && (
              <MmInput
                value={value.gingivalContouring.desiredLengthMm}
                onChange={(mm) =>
                  set({ gingivalContouring: { choice: 'Yes', desiredLengthMm: mm } })
                }
                error={!!errors.gingivalContouringMm}
                readOnly={readOnly}
              />
            )}
          </ConditionalRow>
        </NumberedSection>
      )}

      {enabled('verticalDimension') && (
        <NumberedSection number={next()} label={label('verticalDimension')}>
          <ConditionalRow
            mainError={errors.verticalDimension}
            mmError={errors.verticalDimensionMm}
          >
            <PillGroup
              value={value.verticalDimension.choice}
              onChange={(choice) =>
                set({
                  verticalDimension: {
                    choice,
                    desiredLengthMm:
                      choice === 'Open Bite' ? value.verticalDimension.desiredLengthMm : null,
                  },
                })
              }
              options={['Keep Existing', 'Open Bite', 'Make Ideal'] as const}
              getLabel={optLabel}
              readOnly={readOnly}
              allowDeselect={!req('verticalDimension')}
            />
            {value.verticalDimension.choice === 'Open Bite' && (
              <MmInput
                value={value.verticalDimension.desiredLengthMm}
                onChange={(mm) =>
                  set({ verticalDimension: { choice: 'Open Bite', desiredLengthMm: mm } })
                }
                error={!!errors.verticalDimensionMm}
                readOnly={readOnly}
              />
            )}
          </ConditionalRow>
        </NumberedSection>
      )}

      {enabled('maxLengthOfCentrals') && (
        <NumberedSection number={next()} label={label('maxLengthOfCentrals')}>
          <ConditionalRow
            mainError={errors.maxLengthOfCentrals}
            mmError={errors.maxLengthOfCentralsMm}
          >
            <PillGroup
              value={value.maxLengthOfCentrals.choice}
              onChange={(choice) =>
                set({
                  maxLengthOfCentrals: {
                    choice,
                    desiredLengthMm:
                      choice === 'Other' ? value.maxLengthOfCentrals.desiredLengthMm : null,
                  },
                })
              }
              options={['Ideal', 'Other'] as const}
              getLabel={optLabel}
              readOnly={readOnly}
              allowDeselect={!req('maxLengthOfCentrals')}
            />
            {value.maxLengthOfCentrals.choice === 'Other' && (
              <MmInput
                value={value.maxLengthOfCentrals.desiredLengthMm}
                onChange={(mm) =>
                  set({ maxLengthOfCentrals: { choice: 'Other', desiredLengthMm: mm } })
                }
                error={!!errors.maxLengthOfCentralsMm}
                readOnly={readOnly}
              />
            )}
          </ConditionalRow>
        </NumberedSection>
      )}

      {enabled('checkDesign') && (
        <NumberedSection number={next()} label={label('checkDesign')}>
          <ErrorHelper>{errors.checkDesign}</ErrorHelper>
          <PillGroup
            value={value.checkDesign}
            onChange={(checkDesign) => set({ checkDesign })}
            options={['Yes', 'No'] as const}
            getLabel={optLabel}
            readOnly={readOnly}
            allowDeselect={!req('checkDesign')}
          />
        </NumberedSection>
      )}

      {enabled('occlusalContact') && (
        <NumberedSection number={next()} label={label('occlusalContact')}>
          <ErrorHelper>{errors.occlusalContact}</ErrorHelper>
          <PillGroup
            value={value.occlusalContact}
            onChange={(occlusalContact) => set({ occlusalContact })}
            options={['Tight', 'Zero', 'Relief'] as const}
            getLabel={optLabel}
            readOnly={readOnly}
            allowDeselect={!req('occlusalContact')}
          />
        </NumberedSection>
      )}

      {enabled('rxNotes') && (
        <NumberedSection number={next()} label={label('rxNotes')}>
          <TextField
            value={value.rxNotes}
            onChange={(e) => set({ rxNotes: e.target.value })}
            multiline
            minRows={10}
            fullWidth
            InputProps={{ readOnly: !!readOnly }}
            placeholder=""
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

// ===== Helpers ==============================================================
function ConditionalRow({
  mainError,
  mmError,
  children,
}: {
  mainError?: string;
  mmError?: string;
  children: ReactNode;
}) {
  return (
    <Stack spacing={1}>
      <ErrorHelper>{mainError ?? mmError}</ErrorHelper>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ sm: 'center' }}
        useFlexGap
        flexWrap="wrap"
      >
        {children}
      </Stack>
    </Stack>
  );
}

