import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useTranslation } from 'react-i18next';
import { ToothMap } from '@/components/ToothMap';
import { NumberedSection, PillGroup, ErrorHelper } from './primitives';
import {
  emptySgAnswers,
  coerceSgAnswers,
  validateSg,
  syncImplantDetails,
  ALL_ON_PRESETS,
  SHADE_OPTIONS_SG,
  JAW_RELATION_OPTIONS,
  UPPER_TEETH_SET,
  LOWER_TEETH_SET,
  type SgAnswers,
  type SgJawData,
  type SgAllOnProtocol,
  type SgGuideProtocol,
  type SgJaw,
  type SgJawCondition,
  type SgGuideSupport,
  type SgAbutmentType,
  type SgYesNoLab,
  type SgDentureSide,
  type SgProstheticSetup,
  type SgImplantDetail,
  type SgErrors,
} from './sgTypes';
import type { FormConfiguration, PricingConfig } from '@/types/database';

export { coerceSgAnswers, validateSg, emptySgAnswers };
export type { SgAnswers, SgErrors };

type Props = {
  configuration: FormConfiguration;
  pricing?: PricingConfig;
  value: SgAnswers;
  onChange: (next: SgAnswers) => void;
  readOnly?: boolean;
  showErrors?: boolean;
};

export function SurgicalGuideForm({
  configuration: _configuration,
  pricing: _pricing,
  value,
  onChange,
  readOnly,
  showErrors,
}: Props) {
  const { t } = useTranslation('lab');
  const a = value;
  const errors: SgErrors = showErrors ? validateSg(a) : {};

  const set = (patch: Partial<SgAnswers>) => onChange({ ...a, ...patch });
  const setJaw = (which: 'upper' | 'lower', patch: Partial<SgJawData>) =>
    set({ [which]: { ...a[which], ...patch } });

  const hasUpper = a.jaw === 'UPPER' || a.jaw === 'BOTH';
  const hasLower = a.jaw === 'LOWER' || a.jaw === 'BOTH';

  const sg = (k: string) => t(`sgForm.${k}`);
  const opt = (ns: string, v: string) => t(`sgForm.${ns}.${v}`, { defaultValue: v });

  // Running section counter — only incremented when the element actually renders.
  let counter = 0;
  const next = () => ++counter;

  const jawPrefix = (which: 'upper' | 'lower', label: string) =>
    a.jaw === 'BOTH' ? `${sg(`jaw.${which}Label`)} — ${label}` : label;

  return (
    <Stack spacing={4}>
      {/* ── 1. Guide Protocol ─────────────────────────────────────────────── */}
      <NumberedSection number={next()} label={sg('guideProtocol.label')}>
        <PillGroup<SgGuideProtocol>
          value={a.guideProtocol}
          options={['PILOT', 'FULL_PROTOCOL']}
          getLabel={(o) => opt('guideProtocol', o)}
          onChange={(v) => set({ guideProtocol: v })}
          readOnly={readOnly}
        />
        <ErrorHelper>{errors.guideProtocol}</ErrorHelper>
      </NumberedSection>

      {/* ── 2. Jaw Selection ──────────────────────────────────────────────── */}
      <NumberedSection number={next()} label={sg('jaw.label')}>
        <PillGroup<SgJaw>
          value={a.jaw}
          options={['UPPER', 'LOWER', 'BOTH']}
          getLabel={(o) => opt('jaw', o)}
          onChange={(v) => set({ jaw: v })}
          readOnly={readOnly}
        />
        <ErrorHelper>{errors.jaw}</ErrorHelper>
      </NumberedSection>

      {/* ════════════════ UPPER JAW SECTIONS ════════════════ */}

      {hasUpper && (
        <NumberedSection
          number={next()}
          label={jawPrefix('upper', sg('jawCondition.label'))}
        >
          <PillGroup<SgJawCondition>
            value={a.upper.condition}
            options={['HAS_TEETH', 'PARTIALLY_EDENTULOUS', 'FULLY_EDENTULOUS']}
            getLabel={(o) => opt('jawCondition', o)}
            onChange={(v) => setJaw('upper', { condition: v })}
            readOnly={readOnly}
          />
          <ErrorHelper>{errors.upperCondition}</ErrorHelper>
        </NumberedSection>
      )}

      {hasUpper && (
        <NumberedSection
          number={next()}
          label={jawPrefix('upper', sg('implantPositions.label'))}
        >
          <ImplantPositionsSection
            jawData={a.upper}
            teethSet={UPPER_TEETH_SET}
            onChange={(patch) => setJaw('upper', patch)}
            readOnly={readOnly}
            error={errors.upperPositions}
          />
        </NumberedSection>
      )}

      {hasUpper && (
        <NumberedSection
          number={next()}
          label={jawPrefix('upper', sg('guideSupport.label'))}
        >
          <PillGroup<SgGuideSupport>
            value={a.upper.guideSupport}
            options={['TOOTH_SUPPORTED', 'MUCOSA_SUPPORTED', 'BONE_SUPPORTED', 'STACKABLE', 'CUSTOM']}
            getLabel={(o) => opt('guideSupport', o)}
            onChange={(v) => setJaw('upper', { guideSupport: v })}
            readOnly={readOnly}
          />
          <ErrorHelper>{errors.upperGuideSupport}</ErrorHelper>
        </NumberedSection>
      )}

      {hasUpper && a.upper.implantPositions.length > 0 && (
        <NumberedSection
          number={next()}
          label={jawPrefix('upper', sg('implantSystem.label'))}
        >
          <ImplantSystemSection
            jawData={a.upper}
            onChange={(patch) => setJaw('upper', patch)}
            readOnly={readOnly}
          />
        </NumberedSection>
      )}

      {hasUpper && a.upper.condition === 'FULLY_EDENTULOUS' && (
        <NumberedSection
          number={next()}
          label={jawPrefix('upper', sg('edentulous.sectionLabel'))}
        >
          <EdentulousSubSection
            jawData={a.upper}
            onChange={(patch) => setJaw('upper', patch)}
            readOnly={readOnly}
          />
        </NumberedSection>
      )}

      {/* ════════════════ LOWER JAW SECTIONS ════════════════ */}

      {hasLower && (
        <NumberedSection
          number={next()}
          label={jawPrefix('lower', sg('jawCondition.label'))}
        >
          <PillGroup<SgJawCondition>
            value={a.lower.condition}
            options={['HAS_TEETH', 'PARTIALLY_EDENTULOUS', 'FULLY_EDENTULOUS']}
            getLabel={(o) => opt('jawCondition', o)}
            onChange={(v) => setJaw('lower', { condition: v })}
            readOnly={readOnly}
          />
          <ErrorHelper>{errors.lowerCondition}</ErrorHelper>
        </NumberedSection>
      )}

      {hasLower && (
        <NumberedSection
          number={next()}
          label={jawPrefix('lower', sg('implantPositions.label'))}
        >
          <ImplantPositionsSection
            jawData={a.lower}
            teethSet={LOWER_TEETH_SET}
            onChange={(patch) => setJaw('lower', patch)}
            readOnly={readOnly}
            error={errors.lowerPositions}
          />
        </NumberedSection>
      )}

      {hasLower && (
        <NumberedSection
          number={next()}
          label={jawPrefix('lower', sg('guideSupport.label'))}
        >
          <PillGroup<SgGuideSupport>
            value={a.lower.guideSupport}
            options={['TOOTH_SUPPORTED', 'MUCOSA_SUPPORTED', 'BONE_SUPPORTED', 'STACKABLE', 'CUSTOM']}
            getLabel={(o) => opt('guideSupport', o)}
            onChange={(v) => setJaw('lower', { guideSupport: v })}
            readOnly={readOnly}
          />
          <ErrorHelper>{errors.lowerGuideSupport}</ErrorHelper>
        </NumberedSection>
      )}

      {hasLower && a.lower.implantPositions.length > 0 && (
        <NumberedSection
          number={next()}
          label={jawPrefix('lower', sg('implantSystem.label'))}
        >
          <ImplantSystemSection
            jawData={a.lower}
            onChange={(patch) => setJaw('lower', patch)}
            readOnly={readOnly}
          />
        </NumberedSection>
      )}

      {hasLower && a.lower.condition === 'FULLY_EDENTULOUS' && (
        <NumberedSection
          number={next()}
          label={jawPrefix('lower', sg('edentulous.sectionLabel'))}
        >
          <EdentulousSubSection
            jawData={a.lower}
            onChange={(patch) => setJaw('lower', patch)}
            readOnly={readOnly}
          />
        </NumberedSection>
      )}

      {/* ── Abutment Type ─────────────────────────────────────────────────── */}
      {a.jaw && (
        <NumberedSection number={next()} label={sg('abutment.label')}>
          <PillGroup<SgAbutmentType>
            value={a.abutmentType}
            options={['CEMENTED', 'MULTI_UNIT', 'LAB_DECIDES', 'OTHER_CUSTOM']}
            getLabel={(o) => opt('abutment', o)}
            onChange={(v) => set({ abutmentType: v })}
            readOnly={readOnly}
          />
          {a.abutmentType === 'MULTI_UNIT' && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {sg('abutment.multiUnitNote')}
            </Typography>
          )}
          <ErrorHelper>{errors.abutmentType}</ErrorHelper>
        </NumberedSection>
      )}

      {/* ── Direct Restoration ────────────────────────────────────────────── */}
      {a.jaw && (
        <NumberedSection number={next()} label={sg('restoration.label')}>
          <PillGroup<'YES' | 'NO'>
            value={a.directRestoration}
            options={['YES', 'NO']}
            getLabel={(o) => t(`sgForm.restoration.${o}`)}
            onChange={(v) => set({ directRestoration: v })}
            readOnly={readOnly}
          />

          {a.directRestoration === 'YES' && (
            <Stack spacing={3} sx={{ mt: 2 }}>
              {/* Shade */}
              <Stack spacing={1}>
                <Typography variant="subtitle2">{sg('restoration.shadeLabel')}</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {SHADE_OPTIONS_SG.map((shade) => (
                    <Chip
                      key={shade}
                      label={shade}
                      variant={a.tempShade === shade ? 'filled' : 'outlined'}
                      color={a.tempShade === shade ? 'primary' : 'default'}
                      clickable={!readOnly}
                      onClick={() => {
                        if (readOnly) return;
                        set({
                          tempShade: shade,
                          tempCustomShade: shade !== 'Custom shade' ? '' : a.tempCustomShade,
                        });
                      }}
                      sx={{ borderRadius: 999, fontWeight: 500 }}
                    />
                  ))}
                </Stack>
                {a.tempShade === 'Custom shade' && (
                  <TextField
                    size="small"
                    placeholder={sg('restoration.customShadePlaceholder')}
                    value={a.tempCustomShade}
                    onChange={(e) => set({ tempCustomShade: e.target.value })}
                    InputProps={{ readOnly: !!readOnly }}
                    sx={{ maxWidth: 300, mt: 1 }}
                  />
                )}
              </Stack>

              <Divider />

              {/* Temporary crown teeth */}
              <Stack spacing={1}>
                <Typography variant="subtitle2">{sg('restoration.teethLabel')}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {sg('restoration.teethHint')}
                </Typography>
                <ToothMap
                  value={a.tempTeeth}
                  onChange={(teeth) => { if (!readOnly) set({ tempTeeth: teeth }); }}
                  readOnly={readOnly}
                />
                {a.tempTeeth.length > 0 && (
                  <Typography variant="caption" color="primary" fontWeight={600}>
                    {t('sgForm.restoration.tempCount', { count: a.tempTeeth.length })}
                  </Typography>
                )}
              </Stack>

              <Divider />

              {/* Notes */}
              <Stack spacing={1}>
                <Typography variant="subtitle2">{sg('restoration.notesLabel')}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {sg('restoration.notesHint')}
                </Typography>
                <TextField
                  multiline
                  minRows={4}
                  fullWidth
                  value={a.tempNotes}
                  onChange={(e) => set({ tempNotes: e.target.value })}
                  InputProps={{ readOnly: !!readOnly }}
                />
              </Stack>
            </Stack>
          )}
        </NumberedSection>
      )}
    </Stack>
  );
}

// ─── Implant Positions Section ────────────────────────────────────────────────

function ImplantPositionsSection({
  jawData,
  teethSet,
  onChange,
  readOnly,
  error,
}: {
  jawData: SgJawData;
  teethSet: Set<number>;
  onChange: (patch: Partial<SgJawData>) => void;
  readOnly?: boolean;
  error?: string;
}) {
  const { t } = useTranslation('lab');
  const sg = (k: string) => t(`sgForm.${k}`);

  const applyAllOn = (proto: SgAllOnProtocol) => {
    if (readOnly) return;
    if (proto === 'CUSTOM') {
      onChange({ allOnProtocol: 'CUSTOM' });
      return;
    }
    const preset = ALL_ON_PRESETS[proto];
    const positions = teethSet === UPPER_TEETH_SET ? preset.upper : preset.lower;
    const synced = syncImplantDetails(
      positions,
      jawData.implantDetails,
    );
    onChange({ allOnProtocol: proto, implantPositions: positions, implantDetails: synced });
  };

  const handleToothMapChange = (positions: number[]) => {
    const filtered = positions.filter((n) => teethSet.has(n));
    const synced = syncImplantDetails(filtered, jawData.implantDetails);
    onChange({ implantPositions: filtered, implantDetails: synced, allOnProtocol: 'CUSTOM' });
  };

  const implantCount = jawData.implantPositions.length;

  return (
    <Stack spacing={2}>
      {/* All-On-X shortcuts */}
      <Stack spacing={0.75}>
        <Typography variant="caption" color="text.secondary">
          {sg('allOn.label')}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {(['ALL_ON_4', 'ALL_ON_5', 'ALL_ON_6', 'ALL_ON_8', 'CUSTOM'] as SgAllOnProtocol[]).map(
            (proto) => (
              <Chip
                key={proto}
                label={sg(`allOn.${proto}`)}
                variant={jawData.allOnProtocol === proto ? 'filled' : 'outlined'}
                color={jawData.allOnProtocol === proto ? 'primary' : 'default'}
                clickable={!readOnly}
                onClick={() => applyAllOn(proto)}
                size="small"
                sx={{ borderRadius: 999, fontWeight: 500 }}
              />
            ),
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {sg('allOn.hint')}
        </Typography>
      </Stack>

      {/* Tooth chart — dimmed teeth outside allowed arch */}
      <ToothMap
        value={jawData.implantPositions}
        onChange={handleToothMapChange}
        readOnly={readOnly}
        restrictToTeeth={teethSet}
      />

      {/* Summary */}
      {implantCount > 0 && (
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Typography variant="caption" color="primary" fontWeight={600}>
            {t('sgForm.implantPositions.count', { count: implantCount })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('sgForm.implantPositions.sleeves', { count: implantCount })}
          </Typography>
        </Stack>
      )}

      <ErrorHelper>{error}</ErrorHelper>
    </Stack>
  );
}

// ─── Implant System Section ───────────────────────────────────────────────────

function ImplantSystemSection({
  jawData,
  onChange,
  readOnly,
}: {
  jawData: SgJawData;
  onChange: (patch: Partial<SgJawData>) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation('lab');
  const sg = (k: string) => t(`sgForm.${k}`);

  const positions = jawData.implantPositions;
  const details = jawData.implantDetails;
  const same = jawData.sameImplantSystem;

  const updateDetail = (pos: number, patch: Partial<SgImplantDetail>) => {
    const next = details.map((d) => (d.position === pos ? { ...d, ...patch } : d));
    onChange({ implantDetails: next });
  };

  const applyAll = () => {
    const first = details[0];
    if (!first) return;
    const next = details.map((d) => ({
      ...first,
      position: d.position,
    }));
    onChange({ implantDetails: next });
  };

  return (
    <Stack spacing={2}>
      {!readOnly && (
        <FormControlLabel
          control={
            <Switch
              checked={same}
              onChange={(e) => onChange({ sameImplantSystem: e.target.checked })}
              size="small"
            />
          }
          label={
            <Typography variant="body2">{sg('implantSystem.sameSystem')}</Typography>
          }
        />
      )}

      {same ? (
        /* Single shared card */
        <Stack spacing={2}>
          {details[0] && (
            <ImplantDetailCard
              detail={details[0]}
              label={sg('implantSystem.allPositionsLabel')}
              onChange={(patch) => updateDetail(details[0].position, patch)}
              readOnly={readOnly}
            />
          )}
          {!readOnly && details.length > 1 && (
            <Box>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                variant="outlined"
                onClick={applyAll}
              >
                {sg('implantSystem.applyAll')}
              </Button>
            </Box>
          )}
        </Stack>
      ) : (
        /* One card per position */
        <Stack spacing={2}>
          {positions.map((pos, idx) => {
            const detail = details.find((d) => d.position === pos) ?? {
              position: pos,
              brand: '',
              system: '',
              diameter: '',
              length: '',
              notes: '',
            };
            return (
              <ImplantDetailCard
                key={pos}
                detail={detail}
                label={t('sgForm.implantSystem.position', { num: pos })}
                onChange={(patch) => updateDetail(pos, patch)}
                readOnly={readOnly}
                isFirst={idx === 0}
                onApplyAll={!readOnly && details.length > 1 ? applyAll : undefined}
              />
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

function ImplantDetailCard({
  detail,
  label,
  onChange,
  readOnly,
  isFirst,
  onApplyAll,
}: {
  detail: SgImplantDetail;
  label: string;
  onChange: (patch: Partial<SgImplantDetail>) => void;
  readOnly?: boolean;
  isFirst?: boolean;
  onApplyAll?: () => void;
}) {
  const { t } = useTranslation('lab');
  const sg = (k: string) => t(`sgForm.${k}`);

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle2" fontWeight={600}>
              {label}
            </Typography>
            {isFirst && onApplyAll && (
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={onApplyAll}
                variant="text"
              >
                {sg('implantSystem.applyAll')}
              </Button>
            )}
          </Stack>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            flexWrap="wrap"
            useFlexGap
          >
            <TextField
              label={sg('implantSystem.brand')}
              value={detail.brand}
              onChange={(e) => onChange({ brand: e.target.value })}
              size="small"
              InputProps={{ readOnly: !!readOnly }}
              sx={{ flex: 1, minWidth: 150 }}
            />
            <TextField
              label={sg('implantSystem.system')}
              value={detail.system}
              onChange={(e) => onChange({ system: e.target.value })}
              size="small"
              InputProps={{ readOnly: !!readOnly }}
              sx={{ flex: 1, minWidth: 150 }}
            />
            <TextField
              label={sg('implantSystem.diameter')}
              value={detail.diameter}
              onChange={(e) => onChange({ diameter: e.target.value })}
              size="small"
              InputProps={{ readOnly: !!readOnly }}
              sx={{ width: 120 }}
            />
            <TextField
              label={sg('implantSystem.length')}
              value={detail.length}
              onChange={(e) => onChange({ length: e.target.value })}
              size="small"
              InputProps={{ readOnly: !!readOnly }}
              sx={{ width: 120 }}
            />
          </Stack>
          <TextField
            label={sg('implantSystem.notes')}
            value={detail.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            size="small"
            multiline
            minRows={2}
            fullWidth
            InputProps={{ readOnly: !!readOnly }}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

// ─── Edentulous Sub-section ───────────────────────────────────────────────────

function EdentulousSubSection({
  jawData,
  onChange,
  readOnly,
}: {
  jawData: SgJawData;
  onChange: (patch: Partial<SgJawData>) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation('lab');
  const sg = (k: string) => t(`sgForm.${k}`);
  const opt = (ns: string, v: string) => t(`sgForm.${ns}.${v}`, { defaultValue: v });

  const yesNoLab: ('YES' | 'NO' | 'LAB_DECIDES')[] = ['YES', 'NO', 'LAB_DECIDES'];
  const noDenture = jawData.existingDenture === 'NONE';

  return (
    <Stack spacing={3}>
      {/* Occlusion guide */}
      <Stack spacing={1}>
        <Typography variant="subtitle2">{sg('edentulous.occlusionGuide')}</Typography>
        <PillGroup<SgYesNoLab>
          value={jawData.needsOcclusionGuide}
          options={yesNoLab}
          getLabel={(o) => opt('edentulous', o)}
          onChange={(v) => onChange({ needsOcclusionGuide: v })}
          readOnly={readOnly}
          size="small"
        />
      </Stack>

      {/* Prosthetic setup */}
      <Stack spacing={1}>
        <Typography variant="subtitle2">{sg('edentulous.prostheticSetup')}</Typography>
        <PillGroup<SgProstheticSetup>
          value={jawData.prostheticSetup}
          options={['DIGITAL', 'PHYSICAL', 'NONE', 'LAB_DESIGN']}
          getLabel={(o) => sg(`edentulous.prostheticSetup_${o}`)}
          onChange={(v) => onChange({ prostheticSetup: v })}
          readOnly={readOnly}
          size="small"
        />
      </Stack>

      {/* Jaw relation transfer */}
      <Stack spacing={1}>
        <Typography variant="subtitle2">{sg('edentulous.jawRelation')}</Typography>
        {readOnly ? (
          <Typography variant="body2">
            {jawData.jawRelationTransfer || '—'}
          </Typography>
        ) : (
          <TextField
            select
            size="small"
            value={jawData.jawRelationTransfer}
            onChange={(e) => onChange({ jawRelationTransfer: e.target.value })}
            sx={{ maxWidth: 380 }}
          >
            <MenuItem value="">
              <em>—</em>
            </MenuItem>
            {JAW_RELATION_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      {/* Existing denture */}
      <Stack spacing={1}>
        <Typography variant="subtitle2">{sg('edentulous.existingDenture')}</Typography>
        <PillGroup<SgDentureSide>
          value={jawData.existingDenture}
          options={['UPPER', 'LOWER', 'BOTH', 'NONE']}
          getLabel={(o) => sg(`edentulous.existingDenture_${o}`)}
          onChange={(v) => onChange({ existingDenture: v })}
          readOnly={readOnly}
          size="small"
        />
      </Stack>

      {/* Use existing as reference */}
      <Stack spacing={1} sx={{ opacity: noDenture ? 0.4 : 1, pointerEvents: noDenture ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
        <Typography variant="subtitle2">{sg('edentulous.useExistingRef')}</Typography>
        <PillGroup<SgYesNoLab>
          value={jawData.useExistingDentureRef}
          options={yesNoLab}
          getLabel={(o) => opt('edentulous', o)}
          onChange={(v) => onChange({ useExistingDentureRef: v })}
          readOnly={readOnly || noDenture}
          size="small"
        />
      </Stack>

      {/* Plan based on future prosthetics */}
      <Stack spacing={1} sx={{ opacity: noDenture ? 0.4 : 1, pointerEvents: noDenture ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
        <Typography variant="subtitle2">{sg('edentulous.planFuture')}</Typography>
        <PillGroup<SgYesNoLab>
          value={jawData.planOnFutureProsthetics}
          options={yesNoLab}
          getLabel={(o) => opt('edentulous', o)}
          onChange={(v) => onChange({ planOnFutureProsthetics: v })}
          readOnly={readOnly || noDenture}
          size="small"
        />
      </Stack>
    </Stack>
  );
}
