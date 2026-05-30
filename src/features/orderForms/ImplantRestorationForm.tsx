import { useMemo, useState } from 'react';
import {
  Alert,
  alpha,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useTranslation } from 'react-i18next';
import { ToothMap } from '@/components/ToothMap';
import { NumberedSection, PillGroup, ErrorHelper } from './primitives';
import { CrownAndBridgeForm, coerceCnbAnswers } from './CrownAndBridgeForm';
import type { FormConfiguration, PricingConfig } from '@/types/database';
import {
  TEMPLATE_CODE_IMPLANT,
  DEFAULT_IMPLANT_PRICE_CONFIG,
  ABUTMENT_STATUS_OPTIONS,
  GINGIVAL_HEIGHT_MODE_OPTIONS,
  ABUTMENT_TYPE_OPTIONS,
  IND_MATERIAL_OPTIONS,
  IND_SHAPE_OPTIONS,
  RETENTION_OPTIONS,
  MUA_HEX_OPTIONS,
  MUA_UPPER_CONN_OPTIONS,
  BAR_MATERIAL_OPTIONS,
  BAR_TRY_IN_OPTIONS,
  isImplantConfigComplete,
  validateImplantRestoration,
  coerceImplantAnswers,
  emptyImplantAnswers,
  type ImplantRestorationAnswers,
  type ImplantRestorationErrors,
  type ImplantConfig,
  type AbutmentStatus,
  type AbutmentType,
  type GingivalHeightMode,
} from './implantTypes';

export { coerceImplantAnswers, validateImplantRestoration, emptyImplantAnswers };
export type { ImplantRestorationAnswers };
export { TEMPLATE_CODE_IMPLANT };

// ─── Brand colors ─────────────────────────────────────────────────────────────

const BRAND_COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EC4899', '#0EA5E9', '#EF4444'] as const;
const CUSTOM_BRAND_COLOR = '#9E9E9E';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uniToFdi(u: number): number {
  const MAP: Record<number, number> = {
    1: 18, 2: 17, 3: 16, 4: 15, 5: 14, 6: 13, 7: 12, 8: 11,
    9: 21, 10: 22, 11: 23, 12: 24, 13: 25, 14: 26, 15: 27, 16: 28,
    17: 38, 18: 37, 19: 36, 20: 35, 21: 34, 22: 33, 23: 32, 24: 31,
    25: 41, 26: 42, 27: 43, 28: 44, 29: 45, 30: 46, 31: 47, 32: 48,
  };
  return MAP[u] ?? u;
}

function posLabel(pos: number, notation: 'Universal' | 'FDI'): string {
  return String(notation === 'FDI' ? uniToFdi(pos) : pos);
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  configuration: FormConfiguration;
  pricing?: PricingConfig;
  value: ImplantRestorationAnswers;
  onChange: (next: ImplantRestorationAnswers) => void;
  readOnly?: boolean;
  showErrors?: boolean;
};

// ─── Main component ───────────────────────────────────────────────────────────

export function ImplantRestorationForm({
  configuration,
  pricing,
  value,
  onChange,
  readOnly,
  showErrors,
}: Props) {
  const { t } = useTranslation('lab');
  const a = value;
  const errors: ImplantRestorationErrors = showErrors ? validateImplantRestoration(a) : {};

  const labBrands = pricing?.implant_brands ?? [];

  // Active edit group (positions being configured together)
  const [editGroup, setEditGroup] = useState<number[]>([]);
  // Which position is pending deletion confirmation
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  const set = (patch: Partial<ImplantRestorationAnswers>) => onChange({ ...a, ...patch });

  // ── Position management ──────────────────────────────────────────────────

  const handlePositionsChange = (positions: number[]) => {
    const newConfigs = { ...a.configsByPosition };
    for (const key of Object.keys(newConfigs)) {
      if (!positions.includes(Number(key))) delete newConfigs[key];
    }

    // Doctors were marking teeth without picking a brand and ending up with
    // unconfigured implants. Auto-defaulting to 'custom' surfaces the name
    // field immediately so they know a brand name is needed.
    const isAdding = positions.length > a.implantPositions.length;
    const nextBrand = (!a.brand && isAdding) ? 'custom' : a.brand;

    // Auto-apply global brand to newly added positions
    if (nextBrand) {
      for (const pos of positions) {
        if (!newConfigs[String(pos)]) {
          newConfigs[String(pos)] = { brand: nextBrand };
        }
      }
    }
    const newEditGroup = editGroup.filter((p) => positions.includes(p));
    setEditGroup(newEditGroup);
    set({
      implantPositions: positions,
      configsByPosition: newConfigs,
      submittedPositions: (a.submittedPositions ?? []).filter((p) => positions.includes(p)),
      ...(nextBrand !== a.brand ? { brand: nextBrand } : {}),
    });
  };

  const setGlobalBrand = (brandId: string) => {
    // Stamp brand into any position that doesn't yet have an explicit brand,
    // so they don't keep following the active brush when it changes.
    const newConfigs = { ...a.configsByPosition };
    for (const pos of a.implantPositions) {
      if (!newConfigs[String(pos)]?.brand) {
        newConfigs[String(pos)] = { ...(newConfigs[String(pos)] ?? {}), brand: brandId };
      }
    }
    set({
      brand: brandId,
      brandCustom: brandId !== 'custom' ? undefined : a.brandCustom,
      configsByPosition: newConfigs,
    });
  };

  const removePosition = (pos: number) => {
    const newPositions = a.implantPositions.filter((p) => p !== pos);
    const newConfigs = { ...a.configsByPosition };
    delete newConfigs[String(pos)];
    setEditGroup(editGroup.filter((p) => p !== pos));
    setPendingDelete(null);
    set({
      implantPositions: newPositions,
      configsByPosition: newConfigs,
      submittedPositions: (a.submittedPositions ?? []).filter((p) => p !== pos),
    });
  };

  const isSubmitted = (pos: number) => (a.submittedPositions ?? []).includes(pos);

  const toggleEditGroup = (pos: number) => {
    if (editGroup.includes(pos)) {
      setEditGroup(editGroup.filter((p) => p !== pos));
      return;
    }
    if (isSubmitted(pos)) {
      // Submitted tooth: always open solo (auto-deselect anything else)
      setEditGroup([pos]);
    } else {
      // Unsubmitted tooth: strip submitted positions from current group, then add
      const withoutSubmitted = editGroup.filter((p) => !isSubmitted(p));
      setEditGroup([...withoutSubmitted, pos]);
    }
  };

  const handleSubmitGroup = () => {
    const current = new Set(a.submittedPositions ?? []);
    for (const pos of editGroup) current.add(pos);
    set({ submittedPositions: [...current] });
    setEditGroup([]);
  };

  // ── Per-implant config updates ────────────────────────────────────────────

  // Get the representative config for the edit group (first item's values)
  const representativePos = editGroup.length > 0 ? editGroup[0] : null;
  const representativeCfg: ImplantConfig = representativePos != null
    ? (a.configsByPosition[String(representativePos)] ?? {})
    : {};

  const updateEditGroup = (patch: Partial<ImplantConfig>) => {
    const newConfigs = { ...a.configsByPosition };
    for (const pos of editGroup) {
      newConfigs[String(pos)] = { ...(newConfigs[String(pos)] ?? {}), ...patch };
    }
    set({ configsByPosition: newConfigs });
  };

  // When abutment status changes, clear downstream fields
  const setAbutmentStatus = (status: AbutmentStatus) => {
    updateEditGroup({
      abutmentStatus: status,
      gingivalHeightMode: undefined,
      gingivalHeightMm: undefined,
      abutmentType: undefined,
      indMaterial: undefined,
      indShape: undefined,
      indRetention: undefined,
      muaHex: undefined,
      muaUpperConn: undefined,
      factoryRetention: undefined,
    });
  };

  const setAbutmentType = (type: AbutmentType) => {
    updateEditGroup({
      abutmentType: type,
      indMaterial: undefined,
      indShape: undefined,
      indRetention: undefined,
      muaHex: undefined,
      muaUpperConn: undefined,
      factoryRetention: undefined,
    });
  };

  // ── Brand colors ─────────────────────────────────────────────────────────

  const brandColorById = useMemo(() => {
    const m: Record<string, string> = {};
    labBrands.forEach((b, i) => { m[b.id] = BRAND_COLORS[i % BRAND_COLORS.length]; });
    m['custom'] = CUSTOM_BRAND_COLOR;
    return m;
  }, [labBrands]);

  const positionToothColors = useMemo(() => {
    const m: Record<number, string> = {};
    for (const pos of a.implantPositions) {
      const brand = a.configsByPosition[String(pos)]?.brand ?? a.brand;
      if (brand) { const c = brandColorById[brand]; if (c) m[pos] = c; }
    }
    return m;
  }, [a.implantPositions, a.configsByPosition, a.brand, brandColorById]);

  // ── Section numbering ─────────────────────────────────────────────────────

  let sn = 0;
  const ns = () => ++sn;
  const brandSn = labBrands.length > 0 ? ns() : 0;
  const positionSn = ns();
  const configureSn = ns();
  const barSn = ns();
  const finalSn = ns();

  // ── Has lab-determines (provisional price warning) ─────────────────────────
  const hasLabDetermines = a.implantPositions.some((pos) => {
    const cfg = a.configsByPosition[String(pos)];
    return cfg?.abutmentStatus === 'labDecides' || cfg?.gingivalHeightMode === 'labDetermines';
  });

  return (
    <Stack spacing={3}>

      {/* 1. Brand selector (only when lab has configured brands) */}
      {labBrands.length > 0 && (
        <NumberedSection number={brandSn} label={t('implantForm.sections.brand')}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {[...labBrands.map((b, i) => ({ id: b.id, name: b.name, color: BRAND_COLORS[i % BRAND_COLORS.length] })),
                { id: 'custom', name: t('implantForm.brand.custom'), color: CUSTOM_BRAND_COLOR },
              ].map((b) => {
                const isSel = a.brand === b.id;
                return (
                  <Box
                    key={b.id}
                    role="button"
                    aria-pressed={isSel}
                    tabIndex={readOnly ? -1 : 0}
                    onClick={() => !readOnly && setGlobalBrand(b.id)}
                    onKeyDown={(e) => {
                      if (readOnly) return;
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalBrand(b.id); }
                    }}
                    sx={{
                      display: 'inline-flex', alignItems: 'center', gap: 0.75,
                      px: 1.75, py: 0.75, borderRadius: 999, border: 2,
                      borderColor: isSel ? b.color : 'divider',
                      bgcolor: isSel ? b.color : 'background.paper',
                      color: isSel ? '#fff' : 'text.primary',
                      fontWeight: 500, fontSize: 13,
                      cursor: readOnly ? 'default' : 'pointer',
                      userSelect: 'none',
                      transition: 'border-color 0.15s',
                      '&:hover': readOnly ? {} : { borderColor: b.color },
                    }}
                  >
                    <Box sx={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      bgcolor: isSel ? 'rgba(255,255,255,0.75)' : b.color,
                      border: 1, borderColor: 'rgba(0,0,0,0.12)',
                    }} />
                    {b.name}
                  </Box>
                );
              })}
            </Stack>
            {a.brand === 'custom' && (
              <Box data-form-error={showErrors && !!errors.brandCustom ? 'true' : undefined}>
                <TextField
                  placeholder={t('implantForm.brand.customPlaceholder')}
                  value={a.brandCustom ?? ''}
                  onChange={(e) => set({ brandCustom: e.target.value })}
                  size="small"
                  sx={{ maxWidth: 320 }}
                  InputProps={{ readOnly }}
                  error={showErrors && !!errors.brandCustom}
                  helperText={showErrors && errors.brandCustom ? t('implantForm.brand.customRequired') : undefined}
                />
              </Box>
            )}
            <Typography variant="caption" color="text.secondary">
              {t('implantForm.brand.globalHint')}
            </Typography>
          </Stack>
        </NumberedSection>
      )}

      {/* 2. Implant positions */}
      <NumberedSection number={positionSn} label={`${t('implantForm.sections.positions')} *`}>
        <Stack spacing={1.5}>
          <ToothMap
            value={a.implantPositions}
            toothColors={positionToothColors}
            onChange={readOnly ? undefined : handlePositionsChange}
            readOnly={readOnly}
            notation={a.notation}
          />

          {/* Brand legend — shows which color = which brand for assigned positions */}
          {labBrands.length > 0 && (() => {
            const items: Array<{ label: string; color: string }> = [];
            for (const b of labBrands) {
              if (a.implantPositions.some((pos) => (a.configsByPosition[String(pos)]?.brand ?? a.brand) === b.id)) {
                items.push({ label: b.name, color: brandColorById[b.id] });
              }
            }
            const hasCustom = a.implantPositions.some((pos) => (a.configsByPosition[String(pos)]?.brand ?? a.brand) === 'custom');
            if (hasCustom) items.push({ label: t('implantForm.brand.custom'), color: CUSTOM_BRAND_COLOR });
            if (items.length === 0) return null;
            return (
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                {items.map((item) => (
                  <Stack key={item.label} direction="row" alignItems="center" spacing={0.75}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: item.color, flexShrink: 0 }} />
                    <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                  </Stack>
                ))}
              </Stack>
            );
          })()}

          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" color="text.secondary">
              {t('implantForm.notation')}:
            </Typography>
            <PillGroup
              value={a.notation}
              options={['Universal', 'FDI'] as const}
              getLabel={(v) => v}
              onChange={(v) => set({ notation: v as 'Universal' | 'FDI' })}
              readOnly={readOnly}
              size="small"
            />
          </Stack>
        </Stack>
        <ErrorHelper>{errors.implantPositions}</ErrorHelper>
      </NumberedSection>

      {/* 3. Configure implants */}
      {a.implantPositions.length > 0 && (
        <NumberedSection number={configureSn} label={t('implantForm.sections.configure')}>
          {readOnly ? (
            <PositionDetailList
              positions={a.implantPositions}
              configsByPosition={a.configsByPosition}
              notation={a.notation}
              labBrands={labBrands}
              brandColorById={brandColorById}
              globalBrand={a.brand}
              t={t}
            />
          ) : (
            <>
              {/* Tile grid — immediately under the section heading */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
                {a.implantPositions.map((pos) => {
                  const brandColor = (() => {
                    const brand = a.configsByPosition[String(pos)]?.brand ?? a.brand;
                    return brand ? brandColorById[brand] : undefined;
                  })();
                  return (
                    <PositionTile
                      key={pos}
                      pos={pos}
                      label={posLabel(pos, a.notation)}
                      inGroup={editGroup.includes(pos)}
                      complete={isSubmitted(pos)}
                      hasError={!!(errors.incompleteConfigs?.includes(pos))}
                      brandColor={brandColor}
                      isPendingDel={pendingDelete === pos}
                      showErrors={showErrors}
                      readOnly={readOnly}
                      onTileClick={() => toggleEditGroup(pos)}
                      onDeleteClick={(e) => { e.stopPropagation(); setPendingDelete(pos); }}
                      onConfirmDelete={() => removePosition(pos)}
                      onCancelDelete={() => setPendingDelete(null)}
                    />
                  );
                })}
              </Box>

              <Stack spacing={2}>
                {editGroup.length > 0 && (
                  <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.5 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase" letterSpacing={0.8}>
                      {editGroup.length === 1
                        ? t('implantForm.configure.editingOne', { pos: posLabel(editGroup[0], a.notation) })
                        : t('implantForm.configure.editingMany', { count: editGroup.length })}
                    </Typography>

                    <Stack spacing={2.5} mt={2}>

                      {/* Abutment status */}
                      <Stack spacing={1}>
                        <Typography variant="body2" fontWeight={600}>
                          {t('implantForm.configure.abutmentStatus.label')}
                        </Typography>
                        <PillGroup
                          value={representativeCfg.abutmentStatus ?? ''}
                          options={ABUTMENT_STATUS_OPTIONS.map((o) => o.key) as readonly AbutmentStatus[]}
                          getLabel={(k) => t(`implantForm.configure.abutmentStatus.${k}`)}
                          onChange={(v) => setAbutmentStatus(v as AbutmentStatus)}
                          readOnly={readOnly}
                        />
                      </Stack>

                      {/* labDecides note */}
                      {representativeCfg.abutmentStatus === 'labDecides' && (
                        <Alert severity="info" sx={{ py: 0.5 }}>
                          {t('implantForm.configure.labDecidesNote')}
                        </Alert>
                      )}

                      {/* noAbutment: gingival height */}
                      {representativeCfg.abutmentStatus === 'noAbutment' && (
                        <Stack spacing={1}>
                          <Typography variant="body2" fontWeight={600}>
                            {t('implantForm.configure.gingivalHeight.label')}
                          </Typography>
                          <Stack spacing={1}>
                            <PillGroup
                              value={representativeCfg.gingivalHeightMode ?? ''}
                              options={GINGIVAL_HEIGHT_MODE_OPTIONS.map((o) => o.key) as readonly GingivalHeightMode[]}
                              getLabel={(k) => t(`implantForm.configure.gingivalHeight.${k}`)}
                              onChange={(v) => updateEditGroup({ gingivalHeightMode: v as GingivalHeightMode, gingivalHeightMm: undefined })}
                              readOnly={readOnly}
                            />
                            {representativeCfg.gingivalHeightMode === 'manual' && (
                              <TextField
                                type="number"
                                placeholder={t('implantForm.configure.gingivalHeight.mmPlaceholder')}
                                value={representativeCfg.gingivalHeightMm ?? ''}
                                onChange={(e) => updateEditGroup({ gingivalHeightMm: e.target.value ? Number(e.target.value) : undefined })}
                                size="small"
                                inputProps={{ min: 0, step: 0.5 }}
                                InputProps={{ endAdornment: <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>mm</Typography>, readOnly }}
                                sx={{ maxWidth: 180 }}
                              />
                            )}
                          </Stack>
                        </Stack>
                      )}

                      {/* noAbutment: abutment type */}
                      {representativeCfg.abutmentStatus === 'noAbutment' && (
                        <Stack spacing={1}>
                          <Typography variant="body2" fontWeight={600}>
                            {t('implantForm.configure.abutmentType.label')}
                          </Typography>
                          <PillGroup
                            value={representativeCfg.abutmentType ?? ''}
                            options={ABUTMENT_TYPE_OPTIONS.map((o) => o.key) as readonly AbutmentType[]}
                            getLabel={(k) => t(`implantForm.configure.abutmentType.${k}`)}
                            onChange={(v) => setAbutmentType(v as AbutmentType)}
                            readOnly={readOnly}
                          />
                        </Stack>
                      )}

                      {/* Individual path */}
                      {representativeCfg.abutmentType === 'individual' && (
                        <>
                          <Stack spacing={1}>
                            <Typography variant="body2" fontWeight={600}>
                              {t('implantForm.configure.indMaterial.label')}
                            </Typography>
                            <PillGroup
                              value={representativeCfg.indMaterial ?? ''}
                              options={IND_MATERIAL_OPTIONS.map((o) => o.key) as readonly string[]}
                              getLabel={(k) => t(`implantForm.configure.indMaterial.${k}`)}
                              onChange={(v) => updateEditGroup({ indMaterial: v })}
                              readOnly={readOnly}
                            />
                          </Stack>
                          <Stack spacing={1}>
                            <Typography variant="body2" fontWeight={600}>
                              {t('implantForm.configure.indShape.label')}
                            </Typography>
                            <PillGroup
                              value={representativeCfg.indShape ?? ''}
                              options={IND_SHAPE_OPTIONS.map((o) => o.key) as readonly string[]}
                              getLabel={(k) => t(`implantForm.configure.indShape.${k}`)}
                              onChange={(v) => updateEditGroup({ indShape: v })}
                              readOnly={readOnly}
                            />
                          </Stack>
                          <Stack spacing={1}>
                            <Typography variant="body2" fontWeight={600}>
                              {t('implantForm.configure.retention.label')}
                            </Typography>
                            <PillGroup
                              value={representativeCfg.indRetention ?? ''}
                              options={RETENTION_OPTIONS.map((o) => o.key) as readonly string[]}
                              getLabel={(k) => t(`implantForm.configure.retention.${k}`)}
                              onChange={(v) => updateEditGroup({ indRetention: v })}
                              readOnly={readOnly}
                            />
                          </Stack>
                        </>
                      )}

                      {/* Multiunit path */}
                      {representativeCfg.abutmentType === 'multiunit' && (
                        <>
                          <Stack spacing={1}>
                            <Typography variant="body2" fontWeight={600}>
                              {t('implantForm.configure.muaHex.label')}
                            </Typography>
                            <PillGroup
                              value={representativeCfg.muaHex ?? ''}
                              options={MUA_HEX_OPTIONS.map((o) => o.key) as readonly string[]}
                              getLabel={(k) => t(`implantForm.configure.muaHex.${k}`)}
                              onChange={(v) => updateEditGroup({ muaHex: v })}
                              readOnly={readOnly}
                            />
                          </Stack>
                          <Stack spacing={1}>
                            <Typography variant="body2" fontWeight={600}>
                              {t('implantForm.configure.muaUpperConn.label')}
                            </Typography>
                            <PillGroup
                              value={representativeCfg.muaUpperConn ?? ''}
                              options={MUA_UPPER_CONN_OPTIONS.map((o) => o.key) as readonly string[]}
                              getLabel={(k) => t(`implantForm.configure.muaUpperConn.${k}`)}
                              onChange={(v) => updateEditGroup({ muaUpperConn: v })}
                              readOnly={readOnly}
                            />
                          </Stack>
                        </>
                      )}

                      {/* Ti-base note */}
                      {representativeCfg.abutmentType === 'tibase' && (
                        <Alert severity="info" sx={{ py: 0.5 }}>
                          {t('implantForm.configure.tibaseNote')}
                        </Alert>
                      )}

                      {/* Factory path */}
                      {representativeCfg.abutmentType === 'factory' && (
                        <Stack spacing={1}>
                          <Typography variant="body2" fontWeight={600}>
                            {t('implantForm.configure.retention.label')}
                          </Typography>
                          <PillGroup
                            value={representativeCfg.factoryRetention ?? ''}
                            options={RETENTION_OPTIONS.map((o) => o.key) as readonly string[]}
                            getLabel={(k) => t(`implantForm.configure.retention.${k}`)}
                            onChange={(v) => updateEditGroup({ factoryRetention: v })}
                            readOnly={readOnly}
                          />
                        </Stack>
                      )}

                      {/* Submit button */}
                      <Box sx={{ pt: 1 }}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={handleSubmitGroup}
                          disabled={!editGroup.every((p) => isImplantConfigComplete(a.configsByPosition[String(p)] ?? {}))}
                        >
                          {t('implantForm.configure.submit')}
                        </Button>
                      </Box>

                    </Stack>
                  </Paper>
                )}

                {/* Per-position summary */}
                <PositionSummary
                  positions={a.implantPositions}
                  configsByPosition={a.configsByPosition}
                  notation={a.notation}
                  labBrands={labBrands}
                  brandColorById={brandColorById}
                  submittedPositions={a.submittedPositions ?? []}
                  incompleteConfigs={errors.incompleteConfigs}
                  showErrors={showErrors}
                  t={t}
                />
              </Stack>

              {showErrors && errors.incompleteConfigs && errors.incompleteConfigs.length > 0 && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {t('implantForm.incompleteError', {
                    positions: errors.incompleteConfigs.map((p) => posLabel(p, a.notation)).join(', '),
                  })}
                </Alert>
              )}
            </>
          )}
        </NumberedSection>
      )}

      {/* 4. Bar restoration */}
      {a.implantPositions.length > 0 && (
        <NumberedSection number={barSn} label={t('implantForm.sections.bar')}>
          <Stack spacing={2}>
            <Stack spacing={1}>
              <Typography variant="body2" fontWeight={600}>
                {t('implantForm.bar.needsBar.label')}
              </Typography>
              <PillGroup
                value={a.bar.needsBar === true ? 'yes' : a.bar.needsBar === false ? 'no' : ''}
                options={['yes', 'no'] as const}
                getLabel={(v) => t(`implantForm.bar.needsBar.${v}`)}
                onChange={(v) => set({
                  bar: {
                    ...a.bar,
                    needsBar: v === 'yes',
                    barMaterial: undefined,
                    tryIn: undefined,
                    barTeeth: [],
                  },
                })}
                readOnly={readOnly}
              />
            </Stack>

            {a.bar.needsBar && (
              <>
                <Divider />

                <Stack spacing={1}>
                  <Typography variant="body2" fontWeight={600}>
                    {t('implantForm.bar.barMaterial.label')}
                  </Typography>
                  <PillGroup
                    value={a.bar.barMaterial ?? ''}
                    options={BAR_MATERIAL_OPTIONS.map((o) => o.key) as readonly string[]}
                    getLabel={(k) => t(`implantForm.bar.barMaterial.${k}`)}
                    onChange={(v) => set({ bar: { ...a.bar, barMaterial: v } })}
                    readOnly={readOnly}
                  />
                  <ErrorHelper>{errors.barMaterial}</ErrorHelper>
                </Stack>

                <Stack spacing={1}>
                  <Typography variant="body2" fontWeight={600}>
                    {t('implantForm.bar.tryIn.label')}
                  </Typography>
                  <PillGroup
                    value={a.bar.tryIn ?? ''}
                    options={BAR_TRY_IN_OPTIONS.map((o) => o.key) as readonly string[]}
                    getLabel={(k) => t(`implantForm.bar.tryIn.${k}`)}
                    onChange={(v) => set({ bar: { ...a.bar, tryIn: v || undefined } })}
                    readOnly={readOnly}
                    allowDeselect
                  />
                </Stack>

                <Stack spacing={1}>
                  <Typography variant="body2" fontWeight={600}>
                    {t('implantForm.bar.barTeeth.label')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('implantForm.bar.barTeeth.hint')}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {a.implantPositions.map((pos) => {
                      const inBar = a.bar.barTeeth.includes(pos);
                      return (
                        <Chip
                          key={pos}
                          label={`#${posLabel(pos, a.notation)}`}
                          variant={inBar ? 'filled' : 'outlined'}
                          color={inBar ? 'primary' : 'default'}
                          size="small"
                          onClick={readOnly ? undefined : () => {
                            const newTeeth = inBar
                              ? a.bar.barTeeth.filter((p) => p !== pos)
                              : [...a.bar.barTeeth, pos].sort((x, y) => x - y);
                            set({ bar: { ...a.bar, barTeeth: newTeeth } });
                          }}
                        />
                      );
                    })}
                  </Stack>
                  <ErrorHelper>{errors.barTeeth}</ErrorHelper>
                </Stack>
              </>
            )}
          </Stack>
        </NumberedSection>
      )}

      {/* 5. Crown & Bridge restoration */}
      {a.implantPositions.length > 0 && (
        <NumberedSection number={finalSn} label={t('implantForm.sections.crownRestoration')}>
          <CrownAndBridgeForm
            configuration={configuration}
            pricing={{ ...pricing, materials: pricing?.implant_crown_materials ?? [] } as PricingConfig}
            value={coerceCnbAnswers(a.cnbAnswers ?? {}, pricing?.implant_crown_materials)}
            onChange={(cnb) => set({ cnbAnswers: cnb as unknown as Record<string, unknown> })}
            readOnly={readOnly}
            showErrors={showErrors}
            markedTeeth={a.implantPositions}
          />
        </NumberedSection>
      )}

      {/* Provisional price warning */}
      {hasLabDetermines && (
        <Alert severity="warning">
          {t('implantForm.provisionalNote')}
        </Alert>
      )}
    </Stack>
  );
}

// ─── Unused but required to prevent compiler error from implantTypes import ───

void DEFAULT_IMPLANT_PRICE_CONFIG;

// ─── Position tile (card-style, used in Section 3 edit mode) ─────────────────

function PositionTile({
  label,
  inGroup,
  complete,
  hasError,
  brandColor,
  isPendingDel,
  showErrors,
  readOnly,
  onTileClick,
  onDeleteClick,
  onConfirmDelete,
  onCancelDelete,
}: {
  pos: number;
  label: string;
  inGroup: boolean;
  complete: boolean;
  hasError: boolean;
  brandColor?: string;
  isPendingDel: boolean;
  showErrors?: boolean;
  readOnly?: boolean;
  onTileClick: () => void;
  onDeleteClick: (e: { stopPropagation: () => void }) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const theme = useTheme();
  const tileError = showErrors && hasError;

  if (isPendingDel) {
    return (
      <Paper
        variant="outlined"
        sx={{
          width: 96, minWidth: 96, minHeight: 92, borderRadius: 2, borderWidth: 2,
          borderColor: 'error.main',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          p: 0.75, gap: 0.5,
        }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.2, textAlign: 'center', color: 'error.main' }}>
          #{label}
        </Typography>
        <Typography sx={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, textAlign: 'center', color: 'text.secondary' }}>
          {t('implantForm.positions.deleteConfirm')}
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={onConfirmDelete}
            sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: 11 }}
          >
            {tc('yes')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={onCancelDelete}
            sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: 11 }}
          >
            {tc('no')}
          </Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <Box
      sx={{ width: 96 }}
      data-form-error={tileError ? 'true' : undefined}
    >
      <Paper
        variant="outlined"
        onClick={readOnly ? undefined : onTileClick}
        sx={{
          position: 'relative',
          width: 96, minWidth: 96, minHeight: 92, borderRadius: 2,
          borderWidth: 2,
          cursor: readOnly ? 'default' : 'pointer',
          borderColor: inGroup ? 'primary.main' : tileError ? 'error.main' : 'divider',
          bgcolor: inGroup ? alpha(theme.palette.primary.main, 0.08) : 'background.paper',
          boxShadow: inGroup ? 4 : 0,
          transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.05s',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          '&:hover': readOnly ? {} : {
            boxShadow: 4,
            '& .position-tile-delete': { opacity: 1 },
          },
          '&:active': readOnly ? {} : { transform: 'scale(0.98)' },
        }}
      >
        {/* Brand color strip across the top — overflow:hidden on Paper rounds its corners */}
        {brandColor && (
          <Box sx={{ height: 4, bgcolor: brandColor, flexShrink: 0 }} />
        )}
        <Stack
          alignItems="center"
          justifyContent="center"
          spacing={0.5}
          sx={{ flex: 1, p: 1, pt: 1.25 }}
        >
          <Typography variant="h5" textAlign="center" sx={{ fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>
            #{label}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={0.25}>
            {complete
              ? <CheckCircleOutlineIcon sx={{ fontSize: 12, color: 'success.main' }} />
              : <RadioButtonUncheckedIcon sx={{ fontSize: 12, color: hasError ? 'error.main' : 'warning.main' }} />
            }
            <Typography sx={{
              fontSize: 10.5, lineHeight: 1.2, fontWeight: 500, textAlign: 'center',
              color: complete ? 'success.main' : (hasError ? 'error.main' : 'text.secondary'),
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', wordBreak: 'break-word', px: 0.5,
            }}>
              {complete ? t('implantForm.summary.complete') : t('implantForm.summary.incomplete')}
            </Typography>
          </Stack>
        </Stack>
        {!readOnly && (
          <IconButton
            size="small"
            className="position-tile-delete"
            onClick={onDeleteClick}
            sx={{
              position: 'absolute',
              top: 2,
              right: 2,
              p: 0.25,
              opacity: 0,
              transition: 'opacity 0.15s ease',
              color: 'error.light',
              '& svg': { fontSize: 16 },
              '&:hover': { color: 'error.main', bgcolor: 'transparent' },
              '&:focus-visible': { opacity: 1 },
            }}
          >
            <DeleteOutlineIcon />
          </IconButton>
        )}
      </Paper>
    </Box>
  );
}

// ─── Per-position detail (read-only) ─────────────────────────────────────────

function PositionDetailList({
  positions,
  configsByPosition,
  notation,
  labBrands,
  brandColorById,
  globalBrand,
  t,
}: {
  positions: number[];
  configsByPosition: Record<string, ImplantConfig>;
  notation: 'Universal' | 'FDI';
  labBrands: Array<{ id: string; name: string }>;
  brandColorById: Record<string, string>;
  globalBrand?: string;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}) {
  return (
    <Stack spacing={2}>
      {positions.map((pos) => {
        const cfg: ImplantConfig = configsByPosition[String(pos)] ?? {};
        const label = posLabel(pos, notation);
        const complete = isImplantConfigComplete(cfg);
        const effectiveBrand = cfg.brand ?? globalBrand;
        const brandColor = effectiveBrand ? brandColorById[effectiveBrand] : undefined;

        const rows: Array<{ label: string; value: string }> = [];

        // Brand row
        if (labBrands.length > 0 && effectiveBrand) {
          const brandName = effectiveBrand === 'custom'
            ? (cfg.brandCustom?.trim() || t('implantForm.brand.custom'))
            : (labBrands.find((b) => b.id === effectiveBrand)?.name ?? effectiveBrand);
          rows.push({ label: t('implantForm.brand.label'), value: brandName });
        }

        if (cfg.abutmentStatus) {
          rows.push({
            label: t('implantForm.configure.abutmentStatus.label'),
            value: t(`implantForm.configure.abutmentStatus.${cfg.abutmentStatus}`),
          });
        }

        if (cfg.abutmentStatus === 'noAbutment') {
          if (cfg.gingivalHeightMode) {
            rows.push({
              label: t('implantForm.configure.gingivalHeight.label'),
              value: cfg.gingivalHeightMode === 'manual' && cfg.gingivalHeightMm != null
                ? `${cfg.gingivalHeightMm} mm`
                : t(`implantForm.configure.gingivalHeight.${cfg.gingivalHeightMode}`),
            });
          }

          if (cfg.abutmentType) {
            rows.push({
              label: t('implantForm.configure.abutmentType.label'),
              value: t(`implantForm.configure.abutmentType.${cfg.abutmentType}`),
            });

            if (cfg.abutmentType === 'individual') {
              if (cfg.indMaterial)
                rows.push({ label: t('implantForm.configure.indMaterial.label'), value: t(`implantForm.configure.indMaterial.${cfg.indMaterial}`) });
              if (cfg.indShape)
                rows.push({ label: t('implantForm.configure.indShape.label'), value: t(`implantForm.configure.indShape.${cfg.indShape}`) });
              if (cfg.indRetention)
                rows.push({ label: t('implantForm.configure.retention.label'), value: t(`implantForm.configure.retention.${cfg.indRetention}`) });
            } else if (cfg.abutmentType === 'multiunit') {
              if (cfg.muaHex)
                rows.push({ label: t('implantForm.configure.muaHex.label'), value: t(`implantForm.configure.muaHex.${cfg.muaHex}`) });
              if (cfg.muaUpperConn)
                rows.push({ label: t('implantForm.configure.muaUpperConn.label'), value: t(`implantForm.configure.muaUpperConn.${cfg.muaUpperConn}`) });
            } else if (cfg.abutmentType === 'factory') {
              if (cfg.factoryRetention)
                rows.push({ label: t('implantForm.configure.retention.label'), value: t(`implantForm.configure.retention.${cfg.factoryRetention}`) });
            }
          }
        }

        return (
          <Paper key={pos} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', borderColor: brandColor ?? 'divider' }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{
                px: 2.5, py: 1.5,
                bgcolor: brandColor ? `${brandColor}18` : 'action.hover',
                borderBottom: 1, borderColor: 'divider',
              }}
            >
              {brandColor && (
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: brandColor, flexShrink: 0 }} />
              )}
              <Typography variant="subtitle2" fontWeight={700}>#{label}</Typography>
              <Box sx={{ flex: 1 }} />
              <Typography
                variant="caption"
                fontWeight={600}
                color={complete ? 'success.main' : 'warning.main'}
              >
                {complete ? t('implantForm.summary.complete') : t('implantForm.summary.incomplete')}
              </Typography>
            </Stack>

            {rows.length > 0 ? (
              <Stack divider={<Divider />}>
                {rows.map((row, i) => (
                  <Stack key={i} direction="row" alignItems="baseline" sx={{ px: 2.5, py: 1.25 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 220, flexShrink: 0 }}>
                      {row.label}
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {row.value}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Box sx={{ px: 2.5, py: 1.5 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  {t('implantForm.summary.notConfigured')}
                </Typography>
              </Box>
            )}
          </Paper>
        );
      })}
    </Stack>
  );
}

// ─── Per-position summary (edit mode) ────────────────────────────────────────

function PositionSummary({
  positions,
  configsByPosition,
  notation,
  labBrands,
  brandColorById,
  submittedPositions,
  incompleteConfigs,
  showErrors,
  t,
}: {
  positions: number[];
  configsByPosition: Record<string, ImplantConfig>;
  notation: 'Universal' | 'FDI';
  labBrands: Array<{ id: string; name: string }>;
  brandColorById: Record<string, string>;
  submittedPositions: number[];
  incompleteConfigs?: number[];
  showErrors?: boolean;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}) {
  if (positions.length === 0) return null;

  return (
    <Box sx={{ borderRadius: 1, border: 1, borderColor: 'divider', overflow: 'hidden' }}>
      {positions.map((pos, i) => {
        const cfg: ImplantConfig = configsByPosition[String(pos)] ?? {};
        const complete = submittedPositions.includes(pos);
        const hasError = incompleteConfigs?.includes(pos);
        const label = posLabel(pos, notation);
        const brandColor = cfg.brand ? brandColorById[cfg.brand] : undefined;
        const brandName = cfg.brand
          ? cfg.brand === 'custom'
            ? (cfg.brandCustom?.trim() || t('implantForm.brand.custom'))
            : (labBrands.find((b) => b.id === cfg.brand)?.name ?? cfg.brand)
          : null;

        return (
          <Stack
            key={pos}
            direction="row"
            alignItems="center"
            spacing={1.5}
            data-form-error={showErrors && hasError ? 'true' : undefined}
            sx={{
              px: 2,
              py: 1.25,
              borderTop: i > 0 ? 1 : 0,
              borderColor: 'divider',
              bgcolor: hasError ? 'error.light' : 'transparent',
            }}
          >
            {complete
              ? <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main', flexShrink: 0 }} />
              : <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: hasError ? 'error.main' : 'warning.main', flexShrink: 0 }} />
            }
            {brandColor && (
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: brandColor, flexShrink: 0 }} />
            )}
            <Typography variant="body2" fontWeight={600} sx={{ minWidth: 36 }}>
              #{label}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {cfg.abutmentStatus === 'labDecides'
                ? t('implantForm.summary.labDecides')
                : cfg.abutmentStatus === 'existingAbutment'
                  ? t('implantForm.summary.existingAbutment')
                  : cfg.abutmentType
                    ? t(`implantForm.configure.abutmentType.${cfg.abutmentType}`, { defaultValue: cfg.abutmentType })
                    : t('implantForm.summary.notConfigured')}
            </Typography>
            {brandName && (
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {brandName}
              </Typography>
            )}
            <Typography
              variant="caption"
              color={complete ? 'success.main' : hasError ? 'error.main' : 'text.secondary'}
              fontWeight={600}
              sx={{ flexShrink: 0 }}
            >
              {complete ? t('implantForm.summary.complete') : t('implantForm.summary.incomplete')}
            </Typography>
          </Stack>
        );
      })}
    </Box>
  );
}
