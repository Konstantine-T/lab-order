import { useState } from 'react';
import { Chip, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { NumberedSection, PillGroup, MmInput, ErrorHelper } from './primitives';
import { TreatmentBuilder } from './TreatmentBuilder';
import { SHADE_SCALES, shadeGroupsForScale, type CnbNotation, type CnbToothAssignment } from './cnbTypes';
import {
  emptyEspAnswers,
  coerceEspAnswers,
  validateEsp,
  isEspFieldEnabled,
  isEspFieldRequired,
  ESP_SMILE_TYPES,
  type EspAnswers,
  type EspErrors,
  type EspMisalignment,
  type EspVerticalDimension,
  type EspMaxLength,
} from './espTypes';
import { formatGEL } from '@/utils/pricing';
import type { FormConfiguration, PricingConfig } from '@/types/database';

export { coerceEspAnswers, validateEsp, emptyEspAnswers };
export type { EspAnswers, EspErrors };

type Props = {
  configuration: FormConfiguration;
  pricing?: PricingConfig;
  value: EspAnswers;
  onChange: (next: EspAnswers) => void;
  readOnly?: boolean;
  showErrors?: boolean;
};

export function EspForm({
  configuration,
  pricing,
  value,
  onChange,
  readOnly,
  showErrors,
}: Props) {
  const { t } = useTranslation('lab');
  const a = value;
  const errors: EspErrors = showErrors ? validateEsp(a, configuration) : {};

  const set = (patch: Partial<EspAnswers>) => onChange({ ...a, ...patch });
  const esp = (k: string) => t(`espForm.${k}`);
  const opt = (ns: string, v: string) => t(`espForm.${ns}.${v}`, { defaultValue: v });

  const en = (c: Parameters<typeof isEspFieldEnabled>[1]) => isEspFieldEnabled(configuration, c);
  const req = (c: Parameters<typeof isEspFieldRequired>[1]) => isEspFieldRequired(configuration, c);
  const star = (c: Parameters<typeof req>[0]) => (req(c) ? ' *' : '');

  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const materials = pricing?.materials ?? [];

  const gingivalReductionPrice = pricing?.esp_gingival_reduction_price ?? 0;

  let counter = 0;
  const next = () => ++counter;

  return (
    <Stack spacing={4}>
      {/* 1. Tooth chart + materials */}
      {en('esp_treatments') && (
        <NumberedSection
          number={next()}
          label={`${t('cnbForm.sections.treatments')}${star('esp_treatments')}`}
        >
          <TreatmentBuilder
            materials={materials}
            toothAssignments={a.toothAssignments as CnbToothAssignment[]}
            notation={a.notation as CnbNotation}
            notes={a.treatmentNotes}
            selectedMaterialId={selectedMaterialId}
            onSelectMaterial={setSelectedMaterialId}
            onAssignmentsChange={(next) =>
              set({ toothAssignments: next as EspAnswers['toothAssignments'] })
            }
            onNotationChange={(n) => set({ notation: n })}
            onNotesChange={(s) => set({ treatmentNotes: s })}
            readOnly={readOnly}
            error={errors.treatments}
          />
        </NumberedSection>
      )}

      {/* 2. Misaligned Teeth Correction */}
      {en('esp_misalignment') && (
        <NumberedSection
          number={next()}
          label={`${esp('misalignment.label')}${star('esp_misalignment')}`}
        >
          <PillGroup<EspMisalignment>
            value={a.misalignment}
            options={['AS_MUCH_AS_POSSIBLE', 'OTHER']}
            getLabel={(o) => opt('misalignment', o)}
            onChange={(v) => set({ misalignment: v, misalignmentOther: v !== 'OTHER' ? '' : a.misalignmentOther })}
            readOnly={readOnly}
            allowDeselect={!req('esp_misalignment')}
          />
          {a.misalignment === 'OTHER' && (
            <TextField
              size="small"
              placeholder={esp('misalignment.otherPlaceholder')}
              value={a.misalignmentOther}
              onChange={(e) => set({ misalignmentOther: e.target.value })}
              InputProps={{ readOnly: !!readOnly }}
              sx={{ mt: 1.5, maxWidth: 420 }}
              fullWidth
            />
          )}
          <ErrorHelper>{errors.misalignment}</ErrorHelper>
        </NumberedSection>
      )}

      {/* 3. Gingival Contouring */}
      {en('esp_gingival') && (
        <NumberedSection
          number={next()}
          label={`${esp('gingival.label')}${star('esp_gingival')}`}
        >
          <PillGroup<'YES' | 'NO'>
            value={a.gingivalContouring}
            options={['YES', 'NO']}
            getLabel={(o) => t(`espForm.yesNo.${o}`)}
            onChange={(v) =>
              set({
                gingivalContouring: v,
                needsGingivalReductionGuide: v === 'NO' ? '' : a.needsGingivalReductionGuide,
              })
            }
            readOnly={readOnly}
            allowDeselect={!req('esp_gingival')}
          />
          <ErrorHelper>{errors.gingivalContouring}</ErrorHelper>

          {a.gingivalContouring === 'YES' && (
            <Stack spacing={1} sx={{ mt: 2, pl: 1, borderLeft: 3, borderColor: 'divider' }}>
              <Typography variant="subtitle2">
                {esp('gingival.reductionGuideLabel')}
                {gingivalReductionPrice > 0 && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {t('espForm.gingival.reductionGuidePrice', {
                      amount: formatGEL(gingivalReductionPrice),
                    })}
                  </Typography>
                )}
              </Typography>
              <PillGroup<'YES' | 'NO'>
                value={a.needsGingivalReductionGuide}
                options={['YES', 'NO']}
                getLabel={(o) => t(`espForm.yesNo.${o}`)}
                onChange={(v) => set({ needsGingivalReductionGuide: v })}
                readOnly={readOnly}
                allowDeselect
              />
            </Stack>
          )}
        </NumberedSection>
      )}

      {/* 4. Vertical Dimension for Occlusion */}
      {en('esp_vertical_dimension') && (
        <NumberedSection
          number={next()}
          label={`${esp('verticalDimension.label')}${star('esp_vertical_dimension')}`}
        >
          <PillGroup<EspVerticalDimension>
            value={a.verticalDimension}
            options={['KEEP_EXISTING', 'OPEN_BITE', 'MAKE_IDEAL']}
            getLabel={(o) => opt('verticalDimension', o)}
            onChange={(v) =>
              set({ verticalDimension: v, verticalDimensionMm: v !== 'OPEN_BITE' ? null : a.verticalDimensionMm })
            }
            readOnly={readOnly}
            allowDeselect={!req('esp_vertical_dimension')}
          />
          {a.verticalDimension === 'OPEN_BITE' && (
            <MmInput
              value={a.verticalDimensionMm}
              onChange={(v) => set({ verticalDimensionMm: v })}
              readOnly={readOnly}
              placeholder={esp('verticalDimension.mmPlaceholder')}
            />
          )}
          <ErrorHelper>{errors.verticalDimension}</ErrorHelper>
        </NumberedSection>
      )}

      {/* 5. Max Preferred Length of Centrals */}
      {en('esp_max_length') && (
        <NumberedSection
          number={next()}
          label={`${esp('maxLength.label')}${star('esp_max_length')}`}
        >
          <PillGroup<EspMaxLength>
            value={a.maxLength}
            options={['IDEAL', 'OTHER']}
            getLabel={(o) => opt('maxLength', o)}
            onChange={(v) => set({ maxLength: v, maxLengthOther: v !== 'OTHER' ? '' : a.maxLengthOther })}
            readOnly={readOnly}
            allowDeselect={!req('esp_max_length')}
          />
          {a.maxLength === 'OTHER' && (
            <TextField
              size="small"
              placeholder={esp('maxLength.otherPlaceholder')}
              value={a.maxLengthOther}
              onChange={(e) => set({ maxLengthOther: e.target.value })}
              InputProps={{ readOnly: !!readOnly }}
              sx={{ mt: 1.5, maxWidth: 420 }}
              fullWidth
            />
          )}
          <ErrorHelper>{errors.maxLength}</ErrorHelper>
        </NumberedSection>
      )}

      {/* 6. Shade */}
      {en('esp_shade') && (
        <NumberedSection
          number={next()}
          label={`${t('cnbForm.sections.shade')}${star('esp_shade')}`}
        >
          <Stack spacing={1.5}>
            <PillGroup
              value={a.shadeScale}
              options={SHADE_SCALES}
              getLabel={(s) => t(`cnbForm.shadeScales.${s}`, { defaultValue: s })}
              onChange={(scale) => set({ shadeScale: scale, shade: '' })}
              readOnly={readOnly}
            />
            <Stack spacing={1.25}>
              {shadeGroupsForScale(a.shadeScale).map((g) => (
                <Stack key={g.family} direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {g.shades.map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      variant={a.shade === s ? 'filled' : 'outlined'}
                      color={a.shade === s ? 'primary' : 'default'}
                      clickable={!readOnly}
                      onClick={() => !readOnly && set({ shade: a.shade === s ? '' : s })}
                      sx={{ borderRadius: 999, fontWeight: 500 }}
                    />
                  ))}
                </Stack>
              ))}
            </Stack>
            <TextField
              value={a.shadeNotes}
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

      {/* 7. Smile Type */}
      {en('esp_smile_type') && (
        <NumberedSection
          number={next()}
          label={`${esp('smileType.label')}${star('esp_smile_type')}`}
        >
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {ESP_SMILE_TYPES.map((s) => (
              <Chip
                key={s}
                label={opt('smileType', s)}
                variant={a.smileType === s ? 'filled' : 'outlined'}
                color={a.smileType === s ? 'primary' : 'default'}
                clickable={!readOnly}
                onClick={() => !readOnly && set({ smileType: a.smileType === s ? '' : s })}
                sx={{ borderRadius: 999, fontWeight: 500 }}
              />
            ))}
          </Stack>
          <ErrorHelper>{errors.smileType}</ErrorHelper>
        </NumberedSection>
      )}

      {/* 8. Notes */}
      {en('esp_notes') && (
        <NumberedSection
          number={next()}
          label={`${esp('notes.label')}${star('esp_notes')}`}
        >
          <TextField
            fullWidth
            multiline
            minRows={3}
            placeholder={esp('notes.placeholder')}
            value={a.notes}
            onChange={(e) => set({ notes: e.target.value })}
            InputProps={{ readOnly: !!readOnly }}
          />
        </NumberedSection>
      )}
    </Stack>
  );
}
