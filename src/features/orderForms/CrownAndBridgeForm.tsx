import { useState } from 'react';
import { Box, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { NumberedSection, PillGroup, MmInput, ErrorHelper } from './primitives';
import { TreatmentBuilder } from './TreatmentBuilder';
import {
  SHADE_GROUPS,
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
          />
        </NumberedSection>
      )}

      {enabled('shade') && (
        <NumberedSection number={next()} label={label('shade')}>
          <Stack spacing={1.25}>
            {SHADE_GROUPS.map((g) => (
              <Stack key={g.family} direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {g.shades.map((s) => (
                  <ShadePill
                    key={s}
                    label={s}
                    selected={value.shade === s}
                    disabled={readOnly}
                    onClick={() => set({ shade: s })}
                  />
                ))}
              </Stack>
            ))}
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
  children: React.ReactNode;
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

function ShadePill({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  // A small color swatch matching the family. Subtle — text is the source of truth.
  const swatch = shadeSwatch(label);
  return (
    <Box
      role="button"
      aria-pressed={selected}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onClick?.()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 2,
        py: 0.85,
        fontSize: 14,
        fontWeight: 600,
        borderRadius: 999,
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.main' : 'background.paper',
        color: selected ? 'primary.contrastText' : 'text.primary',
        boxShadow: selected ? 0 : 1,
        cursor: disabled ? 'default' : 'pointer',
        userSelect: 'none',
        '&:hover': disabled
          ? {}
          : {
              bgcolor: selected ? 'primary.dark' : 'action.hover',
              borderColor: 'primary.main',
            },
      }}
    >
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          bgcolor: swatch,
          border: 1,
          borderColor: 'rgba(0,0,0,0.15)',
        }}
      />
      <Typography component="span" variant="body2" fontWeight={600}>
        {label}
      </Typography>
    </Box>
  );
}

// Approximate Vita Classical shade colors (hex). Reference only — not a clinical match.
function shadeSwatch(label: string): string {
  const map: Record<string, string> = {
    A1: '#f3e7d2',
    A2: '#ecd9b6',
    A3: '#dcc196',
    'A3.5': '#cfae7e',
    A4: '#b89464',
    B1: '#f4ebd1',
    B2: '#e8d8a9',
    B3: '#d3bc7d',
    B4: '#bb9c5b',
    C1: '#dccfb6',
    C2: '#c8b790',
    C3: '#aa9669',
    C4: '#8b7849',
    D2: '#d3bfa1',
    D3: '#bca680',
    D4: '#9c855f',
  };
  return map[label] ?? '#dddddd';
}
