import { useState } from 'react';
import type { ReactNode } from 'react';
import { alpha, Box, Stack, TextField, Typography, type SxProps, type Theme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CopyAdornment } from '@/components/design';
import { ShadePicker } from '@/components/ShadePicker';
import { brand, motion, radii, surfaces } from '@/theme/tokens';
import {
  NumberedSection,
  MmInput,
  ErrorHelper,
  CustomQuestionSections,
  RequiredMark,
  SectionStack,
} from './primitives';
import { NotationToggle, TreatmentBuilder } from './TreatmentBuilder';
import {
  CNB_SECTION_CODES,
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
import {
  FC_TOOTH_SHAPES,
  isFcDesignEnabled,
  isFcDesignRequired,
  validateFcDesign,
  type FcDesignAnswers,
} from './fcTypes';
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
  /**
   * Final Construction's design section — tooth shape and a design note —
   * drawn right after the treatments and numbered with the rest. Only that
   * template passes it (see `FinalConstructionForm`); its answers live beside
   * `value` in the flat answers map, not inside the Crown & Bridge shape, so
   * the other templates' stored answers stay exactly as they were.
   */
  design?: {
    value: FcDesignAnswers;
    onChange: (next: FcDesignAnswers) => void;
  };
};

export { coerceCnbAnswers, validateCnb };
export type { CnbAnswers, CnbErrors };

/**
 * The short single-choice sections, in section order. The design gathers the
 * visible ones into one "clinical parameters" card, each keeping its own
 * number, so a doctor answers five quick questions without scrolling past
 * five cards.
 */
const CLINICAL_CODES = [
  'gingivalContouring',
  'verticalDimension',
  'maxLengthOfCentrals',
  'checkDesign',
  'occlusalContact',
] as const satisfies readonly CnbSectionCode[];
type ClinicalCode = (typeof CLINICAL_CODES)[number];

/** The validation keys each clinical question can fail on: its choice, and its length. */
const CLINICAL_ERROR_KEYS: Record<ClinicalCode, (keyof CnbErrors)[]> = {
  gingivalContouring: ['gingivalContouring', 'gingivalContouringMm'],
  verticalDimension: ['verticalDimension', 'verticalDimensionMm'],
  maxLengthOfCentrals: ['maxLengthOfCentrals', 'maxLengthOfCentralsMm'],
  checkDesign: ['checkDesign'],
  occlusalContact: ['occlusalContact'],
};

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
  design,
}: Props) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  // Validated on every render for the sections' done ticks; shown only once
  // the doctor has tried to submit.
  const validation = validateCnb(value, configuration);
  const errors: CnbErrors = showErrors ? validation : {};
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
  // Numbered up front, in section order, because the clinical questions are
  // numbered one by one but rendered together in one card.
  let counter = 0;
  const numbers: Partial<Record<CnbSectionCode, number>> = {};
  // Final Construction's design section follows the treatments: which teeth
  // and in what, then what they should look like, then their shade.
  const designOn = !!design && isFcDesignEnabled(configuration);
  let designNo = 0;
  for (const code of CNB_SECTION_CODES) {
    if (enabled(code)) numbers[code] = ++counter;
    if (code === 'treatments' && designOn) designNo = ++counter;
  }
  const no = (code: CnbSectionCode) => numbers[code] ?? 0;
  const designRequired = designOn && isFcDesignRequired(configuration);
  const designValidation = design ? validateFcDesign(design.value, configuration) : {};
  const designError = showErrors ? designValidation.fcToothShape : undefined;

  const clinical = CLINICAL_CODES.filter(enabled);
  // One question alone gets its own card, titled by the question, as before.
  const lone = clinical.length === 1 ? clinical[0] : null;

  const answerOf = (code: ClinicalCode): string =>
    code === 'checkDesign' || code === 'occlusalContact' ? value[code] : value[code].choice;
  const clinicalValid = (code: ClinicalCode) =>
    CLINICAL_ERROR_KEYS[code].every((k) => !validation[k]);
  // Done once nothing in it fails validation and something is answered, so an
  // untouched card of optional questions stays "not yet" rather than ticked.
  const clinicalDone = (codes: readonly ClinicalCode[]) =>
    codes.every(clinicalValid) && codes.some((code) => answerOf(code) !== '');

  /**
   * A clinical question's answer control, the mm field some answers open, and
   * the error to show — the choice's, else the missing length's.
   */
  const clinicalParts = (
    code: ClinicalCode,
  ): { control: ReactNode; mm?: ReactNode; error?: string } => {
    const shared = {
      readOnly,
      allowDeselect: !req(code),
      getLabel: optLabel,
      ariaLabel: t(`cnbForm.sections.${code}`),
    };
    switch (code) {
      case 'gingivalContouring': {
        const v = value.gingivalContouring;
        return {
          control: (
            <SegmentedChoice
              {...shared}
              value={v.choice}
              options={['Yes', 'No'] as const}
              error={!!errors.gingivalContouring}
              onChange={(choice) =>
                set({
                  gingivalContouring: {
                    choice,
                    desiredLengthMm: choice === 'Yes' ? v.desiredLengthMm : null,
                  },
                })
              }
            />
          ),
          mm: v.choice === 'Yes' && (
            <MmInput
              value={v.desiredLengthMm}
              onChange={(mm) => set({ gingivalContouring: { choice: 'Yes', desiredLengthMm: mm } })}
              error={!!errors.gingivalContouringMm}
              readOnly={readOnly}
            />
          ),
          error: errors.gingivalContouring ?? errors.gingivalContouringMm,
        };
      }
      case 'verticalDimension': {
        const v = value.verticalDimension;
        return {
          control: (
            <SegmentedChoice
              {...shared}
              value={v.choice}
              options={['Keep Existing', 'Open Bite', 'Make Ideal'] as const}
              error={!!errors.verticalDimension}
              onChange={(choice) =>
                set({
                  verticalDimension: {
                    choice,
                    desiredLengthMm: choice === 'Open Bite' ? v.desiredLengthMm : null,
                  },
                })
              }
            />
          ),
          mm: v.choice === 'Open Bite' && (
            <MmInput
              value={v.desiredLengthMm}
              onChange={(mm) => set({ verticalDimension: { choice: 'Open Bite', desiredLengthMm: mm } })}
              error={!!errors.verticalDimensionMm}
              readOnly={readOnly}
            />
          ),
          error: errors.verticalDimension ?? errors.verticalDimensionMm,
        };
      }
      case 'maxLengthOfCentrals': {
        const v = value.maxLengthOfCentrals;
        return {
          control: (
            <SegmentedChoice
              {...shared}
              value={v.choice}
              options={['Ideal', 'Other'] as const}
              error={!!errors.maxLengthOfCentrals}
              onChange={(choice) =>
                set({
                  maxLengthOfCentrals: {
                    choice,
                    desiredLengthMm: choice === 'Other' ? v.desiredLengthMm : null,
                  },
                })
              }
            />
          ),
          mm: v.choice === 'Other' && (
            <MmInput
              value={v.desiredLengthMm}
              onChange={(mm) => set({ maxLengthOfCentrals: { choice: 'Other', desiredLengthMm: mm } })}
              error={!!errors.maxLengthOfCentralsMm}
              readOnly={readOnly}
            />
          ),
          error: errors.maxLengthOfCentrals ?? errors.maxLengthOfCentralsMm,
        };
      }
      case 'checkDesign':
        return {
          control: (
            <SegmentedChoice
              {...shared}
              value={value.checkDesign}
              options={['Yes', 'No'] as const}
              error={!!errors.checkDesign}
              onChange={(checkDesign) => set({ checkDesign })}
            />
          ),
          error: errors.checkDesign,
        };
      case 'occlusalContact':
        return {
          control: (
            <SegmentedChoice
              {...shared}
              value={value.occlusalContact}
              options={['Tight', 'Zero', 'Relief'] as const}
              error={!!errors.occlusalContact}
              onChange={(occlusalContact) => set({ occlusalContact })}
            />
          ),
          error: errors.occlusalContact,
        };
    }
  };

  const loneParts = lone ? clinicalParts(lone) : null;

  const scaleToggle = (
    <SegmentedChoice
      value={value.shadeScale}
      options={SHADE_SCALES}
      getLabel={(s) => t(`cnbForm.shadeScales.${s}`, { defaultValue: s })}
      // Switching scale clears the shade, which belongs to the old one.
      onChange={(scale) => scale && set({ shadeScale: scale, shade: '' })}
      readOnly={readOnly}
      ariaLabel={t('cnbForm.shadeScale')}
    />
  );

  return (
    <SectionStack>
      {enabled('treatments') && (
        <NumberedSection
          number={no('treatments')}
          label={label('treatments')}
          navLabel={t('cnbForm.nav.treatments')}
          done={value.toothAssignments.length > 0 && !validation.treatments}
          // In the header, as the design has it — like the shade scale below,
          // and for the same reason kept in the body when read-only.
          actions={
            readOnly ? undefined : (
              <NotationToggle notation={value.notation} onChange={(notation) => set({ notation })} />
            )
          }
        >
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
            notationInHeader={!readOnly}
            // A lab that moved this service off per-tooth pricing may keep its
            // material list; those unit prices are then not what it costs.
            pricedPerTooth={pricing?.model === 'UNIT_BASED'}
          />
        </NumberedSection>
      )}

      {design && designOn && (
        <NumberedSection
          number={designNo}
          label={`${t('cnbForm.sections.design')}${designRequired ? ' *' : ''}`}
          navLabel={t('cnbForm.nav.design')}
          done={
            !designValidation.fcToothShape &&
            (!!design.value.fcToothShape || !!design.value.fcDesignNotes.trim())
          }
        >
          <Stack spacing={1.75}>
            <Stack spacing={1} alignItems="flex-start">
              <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {t('cnbForm.design.toothShape')}
                {designRequired && <RequiredMark />}
              </Typography>
              <SegmentedChoice
                value={design.value.fcToothShape}
                options={FC_TOOTH_SHAPES}
                getLabel={(shape) => t(`cnbForm.design.shapes.${shape}`)}
                onChange={(fcToothShape) => design.onChange({ ...design.value, fcToothShape })}
                readOnly={readOnly}
                allowDeselect={!designRequired}
                error={!!designError}
                ariaLabel={t('cnbForm.design.toothShape')}
              />
              {/* Under the choice it is about, not under the note. */}
              <ErrorHelper>{designError && tc('errors.required')}</ErrorHelper>
            </Stack>
            <TextField
              value={design.value.fcDesignNotes}
              onChange={(e) => design.onChange({ ...design.value, fcDesignNotes: e.target.value })}
              placeholder={t('cnbForm.design.notesPlaceholder')}
              multiline
              minRows={3}
              fullWidth
              InputProps={{
                readOnly: !!readOnly,
                endAdornment: readOnly && <CopyAdornment text={design.value.fcDesignNotes} />,
              }}
            />
          </Stack>
        </NumberedSection>
      )}

      {enabled('shade') && (
        <NumberedSection
          number={no('shade')}
          label={label('shade')}
          navLabel={t('cnbForm.nav.shade')}
          done={!!value.shade}
          // The editable form puts the scale toggle in the header, as the
          // design does. A read-only rendering has no header controls, so there
          // it heads the body instead, still saying which guide was used.
          actions={readOnly ? undefined : scaleToggle}
        >
          <Stack spacing={1.75}>
            {readOnly && <Box>{scaleToggle}</Box>}
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
              InputProps={{ readOnly: !!readOnly, endAdornment: readOnly && <CopyAdornment text={value.shadeNotes} /> }}
              sx={{ maxWidth: 520 }}
            />
          </Stack>
          {errors.shade && (
            <Box sx={{ mt: 1 }}>
              <ErrorHelper>{errors.shade}</ErrorHelper>
            </Box>
          )}
        </NumberedSection>
      )}

      {clinical.length > 1 && (
        <NumberedSection
          number={`${no(clinical[0])}–${no(clinical[clinical.length - 1])}`}
          label={t('cnbForm.clinicalParams')}
          navLabel={t('cnbForm.nav.clinicalParams')}
          // Counts as required when any question in it is.
          required={clinical.some(req)}
          done={clinicalDone(clinical)}
        >
          <Box sx={{ containerType: 'inline-size' }}>
            <Box sx={paramGridSx}>
              {clinical.map((code) => {
                const p = clinicalParts(code);
                return (
                  <ParamRow
                    key={code}
                    number={no(code)}
                    label={t(`cnbForm.sections.${code}`)}
                    required={req(code)}
                    control={p.control}
                    mm={p.mm}
                    error={p.error}
                  />
                );
              })}
            </Box>
          </Box>
        </NumberedSection>
      )}

      {lone && loneParts && (
        <NumberedSection number={no(lone)} label={label(lone)} done={clinicalDone([lone])}>
          <ConditionalRow error={loneParts.error}>
            {loneParts.control}
            {loneParts.mm}
          </ConditionalRow>
        </NumberedSection>
      )}

      {enabled('rxNotes') && (
        <NumberedSection
          number={no('rxNotes')}
          label={label('rxNotes')}
          done={!!value.rxNotes.trim()}
        >
          <TextField
            value={value.rxNotes}
            onChange={(e) => set({ rxNotes: e.target.value })}
            multiline
            // Grows as the doctor types; four rows is the design's resting height.
            minRows={4}
            fullWidth
            InputProps={{ readOnly: !!readOnly, endAdornment: readOnly && <CopyAdornment text={value.rxNotes} /> }}
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
    </SectionStack>
  );
}

// ===== Helpers ==============================================================

/** Past this width the parameters sit two to a row, as the design lays them out. */
const TWO_UP = 560;

const paramGridSx: SxProps<Theme> = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '14px 20px',
  alignItems: 'start',
  [`@container (min-width: ${TWO_UP}px)`]: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
};

/**
 * One question in the clinical parameters card: "3 · label" on the left, its
 * answer on the right. When the two do not fit on one line the answer drops
 * under the label rather than squeezing it.
 */
function ParamRow({
  number,
  label,
  required,
  control,
  mm,
  error,
}: {
  number: number;
  label: string;
  required: boolean;
  control: ReactNode;
  mm?: ReactNode;
  error?: string;
}) {
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          columnGap: 1.5,
          rowGap: 0.75,
        }}
      >
        <Typography
          component="span"
          sx={{ flex: '1 1 140px', minWidth: 0, fontSize: '0.8125rem', lineHeight: 1.45 }}
        >
          <Box component="b" sx={{ fontWeight: 700 }}>
            {number}
          </Box>
          {' · '}
          {label}
          {required && <RequiredMark />}
        </Typography>
        {/* Right-aligned even when it drops under the label, so the answers
            keep to one edge of the column. */}
        <Box sx={{ ml: 'auto', maxWidth: '100%' }}>{control}</Box>
      </Box>
      {mm && (
        // Under the answer it belongs to, and wide enough for the whole
        // "desired length (mm)" placeholder.
        <Box
          sx={{
            mt: 1,
            display: 'flex',
            justifyContent: 'flex-end',
            '& .MuiFormControl-root': { width: 280, maxWidth: '100%' },
          }}
        >
          {mm}
        </Box>
      )}
      {error && (
        <Box sx={{ mt: 0.5 }}>
          <ErrorHelper>{error}</ErrorHelper>
        </Box>
      )}
    </Box>
  );
}

/**
 * The design's compact segmented control: options in one bordered strip, the
 * chosen one filled with the selection colour (ink; light periwinkle on dark).
 * Single-choice like PillGroup, including clicking the chosen option again to
 * clear it where the answer is optional.
 *
 * The dividers are the strip's own colour showing through a 1px gap, so when a
 * strip is wider than its column — three long Georgian options in a half-width
 * cell — it wraps onto a second line and stays ruled, rather than being cut off
 * by the card.
 */
function SegmentedChoice<T extends string>({
  value,
  options,
  onChange,
  getLabel,
  readOnly,
  allowDeselect,
  error,
  ariaLabel,
}: {
  value: T | '';
  options: readonly T[];
  onChange: (next: T | '') => void;
  getLabel?: (option: T) => string;
  readOnly?: boolean;
  allowDeselect?: boolean;
  error?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Box
      role="group"
      aria-label={ariaLabel}
      // Tells the wizard's section probe a pressed option here is an answer
      // the doctor gave, not a mode that is always on (as PillGroup does).
      data-clearable={allowDeselect ? 'true' : undefined}
      sx={(theme) => ({
        display: 'inline-flex',
        flexWrap: 'wrap',
        gap: '1px',
        maxWidth: '100%',
        border: '1px solid',
        borderColor: error ? 'error.main' : surfaces[theme.palette.mode].control,
        borderRadius: `${radii.control}px`,
        bgcolor: surfaces[theme.palette.mode].control,
        overflow: 'hidden',
      })}
    >
      {options.map((opt) => {
        const on = value === opt;
        return (
          <Box
            key={opt}
            component="button"
            type="button"
            aria-pressed={on}
            aria-disabled={readOnly || undefined}
            tabIndex={readOnly ? -1 : 0}
            onClick={() => {
              if (readOnly) return;
              if (!on) onChange(opt);
              else if (allowDeselect) onChange('');
            }}
            sx={{
              // Grows to fill a full-width or wrapped strip.
              flex: '1 1 auto',
              minHeight: 34,
              // Under the design's 12px, so the longest Georgian three-way
              // answer (~290px) still fits a half-width cell on one line.
              px: 1,
              py: 0.5,
              border: 0,
              bgcolor: on ? 'primary.main' : 'background.paper',
              color: on ? 'primary.contrastText' : 'text.primary',
              fontFamily: 'inherit',
              fontSize: '0.8125rem',
              // One weight whether chosen or not: a bolder choice is wider, and
              // could tip a strip that just fits onto a second line mid-click.
              fontWeight: 500,
              lineHeight: 1.25,
              textAlign: 'center',
              cursor: readOnly ? 'default' : 'pointer',
              transition: `background-color ${motion.fast}, color ${motion.fast}`,
              '&:hover': readOnly
                ? {}
                : on
                  ? { bgcolor: 'primary.dark' }
                  : // A tint laid over the paper: the fill has to stay opaque
                    // or the divider colour behind it would show through.
                    { backgroundImage: `linear-gradient(${alpha(brand.main, 0.06)}, ${alpha(brand.main, 0.06)})` },
              '&:focus-visible': {
                outline: 'none',
                boxShadow: `inset 0 0 0 2px ${alpha(brand.main, 0.6)}`,
              },
            }}
          >
            {getLabel ? getLabel(opt) : opt}
          </Box>
        );
      })}
    </Box>
  );
}

/** A lone clinical question: its answer and mm field in a row, error above. */
function ConditionalRow({ error, children }: { error?: string; children: ReactNode }) {
  return (
    <Stack spacing={1}>
      <ErrorHelper>{error}</ErrorHelper>
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
