import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Callout, Icon, SectionCard, Segmented } from '@/components/design';
import { NumberField } from '@/components/NumberField';
import type {
  FieldConfig,
  MaterialOption,
  PricingConfig,
  PricingModel,
  RushType,
} from '@/types/database';
import {
  MATERIAL_COLORS,
  MAX_MATERIALS,
  isCnbTemplate,
} from '@/features/orderForms/cnbTypes';
import { TEMPLATE_CODE_SG, SG_SUPPORT_TYPES } from '@/features/orderForms/sgTypes';
import { TEMPLATE_CODE_ESP } from '@/features/orderForms/espTypes';
import {
  DEFAULT_IMPLANT_PRICE_CONFIG,
  TEMPLATE_CODE_IMPLANT_ABUTMENTS,
  isImplantTemplate,
} from '@/features/orderForms/implantTypes';
import { isFabTemplate } from '@/features/orderForms/fabTypes';
import { isModelTemplateCode } from '@/features/orderForms/modelTypes';
import { pricingIssues, type PricingIssue } from '@/utils/pricing';
import { defaultAutomaticModel } from './buildDefaultConfig';
import type { SgSupportFee, ImplantPriceItem } from '@/types/database';

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

/** The models behind "Automatic estimate"; LAB_DESCRIBED is the other mode. */
type AutoModel = Exclude<PricingModel, 'LAB_DESCRIBED'>;
const AUTO_MODELS: readonly AutoModel[] = ['UNIT_BASED', 'FIXED_PRICE', 'NO_PRICING'];
const isAutoModel = (m: PricingModel): m is AutoModel =>
  (AUTO_MODELS as readonly string[]).includes(m);

type PricingMode = 'described' | 'automatic';

export function PricingPanel({
  pricing,
  onChange,
  // Only read for the automatic model a described service switches to (a
  // template with a tooth chart starts unit based, as it was seeded before).
  fields,
  templateCode,
  /** Upper bound for the rush turnaround input — usually the service's
   *  `average_turnaround_days`. Rush has to be faster than the regular
   *  turnaround, so the lab can't enter a value above this. */
  maxRushTurnaroundDays,
}: {
  pricing: PricingConfig;
  onChange: (next: PricingConfig) => void;
  fields: FieldConfig[];
  templateCode?: string;
  maxRushTurnaroundDays?: number;
}) {
  const { t } = useTranslation('lab');
  const isCnb = isCnbTemplate(templateCode);
  const isSg = templateCode === TEMPLATE_CODE_SG;
  const isEsp = templateCode === TEMPLATE_CODE_ESP;
  // Both implant templates price by the component grid and the bar; lab-placed
  // abutments has no crowns, so the crown materials are left out for it.
  const isImplant = isImplantTemplate(templateCode);
  const abutmentsOnly = templateCode === TEMPLATE_CODE_IMPLANT_ABUTMENTS;
  const isFab = isFabTemplate(templateCode);
  const isModel = isModelTemplateCode(templateCode);

  // Same source of truth as the publish gate, so the inline field errors and
  // the "can't publish" callout can never disagree about which row is wrong.
  const issues = pricingIssues(pricing, templateCode);

  const setMaterials = (next: MaterialOption[]) =>
    onChange({ ...pricing, materials: next });

  // Two modes (to75nCxF): the lab's own description, or one of the automatic
  // models. Switching keeps every field — lists and prices alike — so going
  // back loses nothing; the automatic model last used is remembered here.
  const described = pricing.model === 'LAB_DESCRIBED';
  const [autoModel, setAutoModel] = useState<AutoModel>(() =>
    isAutoModel(pricing.model) ? pricing.model : defaultAutomaticModel(templateCode, fields),
  );
  const setMode = (mode: PricingMode) => {
    if (mode === 'described' && !described) {
      if (isAutoModel(pricing.model)) setAutoModel(pricing.model);
      onChange({ ...pricing, model: 'LAB_DESCRIBED' });
    } else if (mode === 'automatic' && described) {
      onChange({ ...pricing, model: autoModel });
    }
  };

  const descriptionError =
    pricing.price_description !== undefined &&
    issues.some((x) => x.kind === 'price-description');

  // What the doctor picks from, shown in both modes (with prices only in the
  // automatic one), so the two can never disagree about the lists.
  const hasMaterialList = isCnb || isEsp || isFab;
  const materialsEditor = (hidePrices: boolean) => (
    <MaterialsEditor
      materials={pricing.materials ?? []}
      onChange={setMaterials}
      issues={issues}
      hidePrices={hidePrices}
      t={t}
    />
  );
  const implantEditor = (hidePrices: boolean) => (
    <ImplantPricingSection
      abutmentsOnly={abutmentsOnly}
      config={pricing.implant_price_config ?? DEFAULT_IMPLANT_PRICE_CONFIG}
      onChange={(next) => onChange({ ...pricing, implant_price_config: next })}
      brands={pricing.implant_brands ?? []}
      onBrandsChange={(next) => onChange({ ...pricing, implant_brands: next })}
      crownMaterials={pricing.implant_crown_materials ?? []}
      onCrownMaterialsChange={(next) => onChange({ ...pricing, implant_crown_materials: next })}
      hidePrices={hidePrices}
      issues={hidePrices ? issues : []}
      t={t}
    />
  );

  return (
    <SectionCard icon="payments" title={t('forms.editor.pricing.title')}>
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography variant="subtitle2">{t('forms.editor.pricing.model')}</Typography>
            <Segmented<PricingMode>
              value={described ? 'described' : 'automatic'}
              onChange={setMode}
              options={[
                { value: 'described', label: t('forms.editor.pricing.modes.described') },
                { value: 'automatic', label: t('forms.editor.pricing.modes.automatic') },
              ]}
            />
          </Stack>

          {/* Priced in the lab's own words: the default for new services. A
              new service has no description at all yet (undefined), and its
              field is not flagged until the lab has typed into it; the publish
              callout names the omission meanwhile. */}
          {described && (
            <TextField
              label={t('forms.editor.pricing.priceDescription')}
              value={pricing.price_description ?? ''}
              onChange={(e) => onChange({ ...pricing, price_description: e.target.value })}
              error={descriptionError}
              helperText={
                descriptionError
                  ? t('forms.editor.pricing.priceDescriptionRequired')
                  : t('forms.editor.pricing.priceDescriptionHelp')
              }
              placeholder={t('forms.editor.pricing.priceDescriptionExample')}
              InputLabelProps={{ shrink: true }}
              multiline
              minRows={5}
              fullWidth
            />
          )}

          {described && (hasMaterialList || isImplant) && (
            <Stack spacing={2}>
              <Stack>
                <Typography variant="subtitle2">{t('forms.editor.pricing.choicesTitle')}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('forms.editor.pricing.choicesHelp')}
                </Typography>
              </Stack>
              {hasMaterialList && materialsEditor(true)}
              {isImplant && implantEditor(true)}
            </Stack>
          )}

          {!described && (
            <TextField
              select
              label={t('forms.editor.pricing.automaticModel')}
              value={pricing.model}
              onChange={(e) => {
                const next = e.target.value as AutoModel;
                setAutoModel(next);
                onChange({ ...pricing, model: next });
              }}
              fullWidth
            >
              <MenuItem value="UNIT_BASED">
                {t('forms.editor.pricing.models.UNIT_BASED')}
              </MenuItem>
              <MenuItem value="FIXED_PRICE">
                {t('forms.editor.pricing.models.FIXED_PRICE')}
              </MenuItem>
              <MenuItem value="NO_PRICING">
                {t('forms.editor.pricing.models.NO_PRICING')}
              </MenuItem>
            </TextField>
          )}

          {/* The one option with no fields under it, so without this the panel
              would just go blank and look broken. It is also the one option
              that silently costs the lab its own numbers — receivables and the
              doctor's estimate both go empty — so it says so plainly. */}
          {pricing.model === 'NO_PRICING' && (
            <Callout tone="warning" icon="warning">
              {t('forms.editor.pricing.noPricingWarning')}
            </Callout>
          )}

          {/* CnB / ESP UNIT_BASED — materials editor */}
          {pricing.model === 'UNIT_BASED' && hasMaterialList && (
            <Stack spacing={2}>
              {materialsEditor(false)}

              {/* ESP: gingival reduction guide extra fee */}
              {isEsp && (
                <>
                  <Divider />
                  <NumberField
                    label={t('espForm.pricing.gingivalReductionPrice')}
                    value={pricing.esp_gingival_reduction_price}
                    onChange={(v) => onChange({ ...pricing, esp_gingival_reduction_price: v ?? undefined })}
                    decimal
                    min={0}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">GEL</InputAdornment>,
                    }}
                    fullWidth
                  />
                </>
              )}
            </Stack>
          )}

          {/* Surgical Guide UNIT_BASED — two protocol prices + support type fees */}
          {pricing.model === 'UNIT_BASED' && isSg && (
            <Stack spacing={2}>
              <NumberField
                label={t('sgForm.pricing.pilotUnitPrice')}
                value={pricing.sg_pilot_unit_price}
                onChange={(v) => onChange({ ...pricing, sg_pilot_unit_price: v })}
                decimal
                min={0}
                InputProps={{
                  endAdornment: <InputAdornment position="end">GEL</InputAdornment>,
                }}
                fullWidth
              />
              <NumberField
                label={t('sgForm.pricing.fullProtocolUnitPrice')}
                value={pricing.sg_full_protocol_unit_price}
                onChange={(v) => onChange({ ...pricing, sg_full_protocol_unit_price: v })}
                decimal
                min={0}
                InputProps={{
                  endAdornment: <InputAdornment position="end">GEL</InputAdornment>,
                }}
                fullWidth
              />
              <Divider />
              <Stack>
                <Typography variant="subtitle2">
                  {t('sgForm.pricing.supportFeesTitle')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('sgForm.pricing.supportFeesHelp')}
                </Typography>
              </Stack>
              {SG_SUPPORT_TYPES.map((supportType) => {
                const existing = (pricing.sg_support_fees ?? []).find(
                  (sf) => sf.supportType === supportType,
                );
                return (
                  <Stack
                    key={supportType}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    alignItems={{ sm: 'center' }}
                  >
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 180 }}>
                      {t(`sgForm.guideSupport.${supportType}`, { defaultValue: supportType })}
                    </Typography>
                    <NumberField
                      label={t('sgForm.pricing.supportFeeLabel')}
                      value={existing?.extra_fee}
                      onChange={(v) => {
                        const cur = (pricing.sg_support_fees ?? []).filter(
                          (sf) => sf.supportType !== supportType,
                        );
                        const next: SgSupportFee[] =
                          v != null && v > 0
                            ? [...cur, { supportType, extra_fee: v }]
                            : cur;
                        onChange({ ...pricing, sg_support_fees: next });
                      }}
                      decimal
                      min={0}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">GEL</InputAdornment>,
                      }}
                      size="small"
                      sx={{ width: 200 }}
                    />
                  </Stack>
                );
              })}
            </Stack>
          )}

          {/* Constructions on Implants — brands + crown materials + per-item price grid */}
          {pricing.model === 'UNIT_BASED' && isImplant && implantEditor(false)}

          {/* Model printing — single price charged per jaw (BOTH = 2 arches) */}
          {pricing.model === 'UNIT_BASED' && isModel && (
            <NumberField
              label={t('forms.editor.pricing.modelPerJawPrice')}
              helperText={
                issues.some((x) => x.kind === 'model-price')
                  ? t('forms.editor.pricing.priceRequired')
                  : t('forms.editor.pricing.modelPerJawHelp')
              }
              error={issues.some((x) => x.kind === 'model-price')}
              value={pricing.model_per_jaw_price}
              onChange={(v) => onChange({ ...pricing, model_per_jaw_price: v })}
              decimal
              min={0}
              InputProps={{
                endAdornment: <InputAdornment position="end">GEL</InputAdornment>,
              }}
              fullWidth
            />
          )}

          {/* Generic UNIT_BASED — single global unit price */}
          {pricing.model === 'UNIT_BASED' && !isCnb && !isSg && !isEsp && !isImplant && !isModel && (
            <NumberField
              label={t('forms.editor.pricing.unitPrice')}
              value={pricing.unit_price}
              onChange={(v) => onChange({ ...pricing, unit_price: v })}
              error={issues.some((x) => x.kind === 'unit-price')}
              helperText={
                issues.some((x) => x.kind === 'unit-price')
                  ? t('forms.editor.pricing.priceRequired')
                  : undefined
              }
              decimal
              min={0}
              InputProps={{
                endAdornment: <InputAdornment position="end">GEL</InputAdornment>,
              }}
              fullWidth
            />
          )}

          {pricing.model === 'FIXED_PRICE' && (
            <NumberField
              label={t('forms.editor.pricing.fixedPrice')}
              value={pricing.fixed_price}
              onChange={(v) => onChange({ ...pricing, fixed_price: v })}
              error={issues.some((x) => x.kind === 'fixed-price')}
              helperText={
                issues.some((x) => x.kind === 'fixed-price')
                  ? t('forms.editor.pricing.priceRequired')
                  : undefined
              }
              decimal
              min={0}
              InputProps={{
                endAdornment: <InputAdornment position="end">GEL</InputAdornment>,
              }}
              fullWidth
            />
          )}

          <Divider />

          <Typography variant="subtitle2">{t('forms.editor.pricing.rushType')}</Typography>
          <TextField
            select
            value={pricing.rush?.type ?? 'NONE'}
            onChange={(e) =>
              onChange({
                ...pricing,
                rush: {
                  type: e.target.value as RushType,
                  value: pricing.rush?.value,
                  turnaround_days: pricing.rush?.turnaround_days,
                },
              })
            }
            fullWidth
          >
            <MenuItem value="NONE">{t('forms.editor.pricing.rushNone')}</MenuItem>
            <MenuItem value="PERCENTAGE">{t('forms.editor.pricing.rushPercent')}</MenuItem>
            <MenuItem value="FIXED_AMOUNT">{t('forms.editor.pricing.rushFixed')}</MenuItem>
          </TextField>
          {pricing.rush && pricing.rush.type !== 'NONE' && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <NumberField
                label={t('forms.editor.pricing.rushValue')}
                value={pricing.rush.value}
                onChange={(v) =>
                  onChange({
                    ...pricing,
                    rush: { ...pricing.rush, value: v },
                  })
                }
                decimal
                min={0}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      {pricing.rush.type === 'PERCENTAGE' ? '%' : 'GEL'}
                    </InputAdornment>
                  ),
                }}
                fullWidth
              />
              <NumberField
                label={t('forms.editor.pricing.rushTurnaroundDays')}
                helperText={
                  maxRushTurnaroundDays
                    ? t('forms.editor.pricing.rushTurnaroundDaysMax', {
                        count: maxRushTurnaroundDays,
                      })
                    : t('forms.editor.pricing.rushTurnaroundDaysHelp')
                }
                value={pricing.rush.turnaround_days}
                onChange={(v) =>
                  onChange({
                    ...pricing,
                    rush: { ...pricing.rush, turnaround_days: v },
                  })
                }
                min={1}
                max={maxRushTurnaroundDays}
                fullWidth
              />
            </Stack>
          )}
        </Stack>
    </SectionCard>
  );
}

// ─── Materials editor ─────────────────────────────────────────────────────────

/**
 * The lab's material list (C&B and its variants, ESP, print, milling): what the
 * doctor picks per tooth. One editor for both pricing modes; `hidePrices`
 * drops the price column for a described service, whose prices live in its
 * description. A price kept from automatic pricing stays stored, unused.
 */
function MaterialsEditor({
  materials,
  onChange,
  issues,
  hidePrices,
  t,
}: {
  materials: MaterialOption[];
  onChange: (next: MaterialOption[]) => void;
  issues: PricingIssue[];
  hidePrices: boolean;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const addMaterial = () => {
    if (materials.length >= MAX_MATERIALS) return;
    onChange([...materials, { id: makeId(), name: '' }]);
  };

  const updateMaterial = (id: string, patch: Partial<MaterialOption>) => {
    onChange(materials.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const removeMaterial = (id: string) => {
    onChange(materials.filter((m) => m.id !== id));
  };

  return (
    <Stack spacing={2}>
      <Stack>
        <Typography variant="subtitle2">
          {t('forms.editor.pricing.materialsTitle')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {hidePrices
            ? t('forms.editor.pricing.materialsNamesHelp')
            : t('forms.editor.pricing.materialsHelp')}
        </Typography>
      </Stack>

      {materials.map((mat, i) => {
        const color = MATERIAL_COLORS[i % MATERIAL_COLORS.length];
        const hasPrice = (mat.unit_price ?? 0) > 0;
        const blankName = issues.some((x) => x.kind === 'material-name' && x.index === i);
        // Defer errors so a pristine, untouched row doesn't flash red: with
        // prices, flag the name only once a price is entered, and the price
        // only once the row is named (the other half signals intent to fill
        // it). Without prices, a blank row is flagged once another follows it.
        const nameError = hidePrices
          ? blankName && i < materials.length - 1
          : hasPrice && blankName;
        const priceError =
          !hidePrices && issues.some((x) => x.kind === 'material-price' && x.index === i);
        return (
          <Stack
            key={mat.id}
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ sm: 'flex-start' }}
          >
            <Box
              sx={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                bgcolor: color,
                flexShrink: 0,
                border: 1,
                borderColor: 'divider',
                mt: 1,
              }}
            />
            <TextField
              label={t('forms.editor.pricing.materialName')}
              value={mat.name}
              onChange={(e) => updateMaterial(mat.id, { name: e.target.value })}
              error={nameError}
              helperText={nameError ? t('forms.editor.pricing.nameRequired') : undefined}
              size="small"
              sx={{ flex: 1 }}
            />
            {!hidePrices && (
              <NumberField
                label={t('forms.editor.pricing.materialUnitPrice')}
                value={mat.unit_price}
                onChange={(v) => updateMaterial(mat.id, { unit_price: v })}
                error={priceError}
                helperText={priceError ? t('forms.editor.pricing.priceRequired') : undefined}
                decimal
                min={0}
                InputProps={{
                  endAdornment: <InputAdornment position="end">GEL</InputAdornment>,
                }}
                size="small"
                sx={{ width: 200 }}
              />
            )}
            <IconButton onClick={() => removeMaterial(mat.id)} size="small">
              <Icon name="delete" size={18} />
            </IconButton>
          </Stack>
        );
      })}

      <Box>
        <Button
          startIcon={<Icon name="add" size={17} />}
          variant="outlined"
          onClick={addMaterial}
          disabled={materials.length >= MAX_MATERIALS}
        >
          {t('forms.editor.pricing.addMaterial')}
        </Button>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ ml: 2 }}
        >
          {materials.length} / {MAX_MATERIALS}
        </Typography>
      </Box>
    </Stack>
  );
}

// ─── Implant Pricing Section ──────────────────────────────────────────────────

type ImplantPriceGroup = {
  titleKey: string;
  keys: string[];
  hidePrice?: boolean;
};

const IMPLANT_PRICE_GROUPS: ImplantPriceGroup[] = [
  { titleKey: 'implantForm.pricing.groups.abutmentType',    keys: ['individual', 'multiunit', 'tibase', 'factory'] },
  { titleKey: 'implantForm.pricing.groups.indMaterial',     keys: ['titanium', 'cocr', 'zirconia'] },
  { titleKey: 'implantForm.pricing.groups.shape',           keys: ['concave', 'straight', 'convex'], hidePrice: true },
  { titleKey: 'implantForm.pricing.groups.retention',       keys: ['cement', 'screw'] },
  { titleKey: 'implantForm.pricing.groups.muaHex',          keys: ['hex', 'nonHex'] },
  { titleKey: 'implantForm.pricing.groups.muaUpperConn',    keys: ['cups', 'rosen', 'screwForBar'] },
  { titleKey: 'implantForm.pricing.groups.barMaterial',     keys: ['titaniumBar', 'cocrMilled', 'cocrPrinted', 'zirconiaBar', 'peekBar'] },
];

function ImplantPricingSection({
  abutmentsOnly,
  config,
  onChange,
  brands,
  onBrandsChange,
  crownMaterials,
  onCrownMaterialsChange,
  hidePrices = false,
  issues = [],
  t,
}: {
  /** Lab-placed abutments: no crown materials to set (its bar is priced as
   *  on Constructions on Implants). */
  abutmentsOnly?: boolean;
  /**
   * A described service: the same brands, crown materials and on/off
   * switches, with no price inputs. Prices already stored stay untouched.
   */
  hidePrices?: boolean;
  /** Publish issues to point at in place (the described mode's list rules). */
  issues?: PricingIssue[];
  config: Record<string, ImplantPriceItem>;
  onChange: (next: Record<string, ImplantPriceItem>) => void;
  brands: { id: string; name: string }[];
  onBrandsChange: (next: { id: string; name: string }[]) => void;
  crownMaterials: MaterialOption[];
  onCrownMaterialsChange: (next: MaterialOption[]) => void;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const updateItem = (key: string, patch: Partial<ImplantPriceItem>) => {
    const item = config[key] ?? DEFAULT_IMPLANT_PRICE_CONFIG[key];
    if (!item) return;
    onChange({ ...config, [key]: { ...item, ...patch } });
  };

  const addBrand = () => {
    onBrandsChange([...brands, { id: makeId(), name: '' }]);
  };
  const updateBrand = (id: string, name: string) => {
    onBrandsChange(brands.map((b) => (b.id === id ? { ...b, name } : b)));
  };
  const removeBrand = (id: string) => {
    onBrandsChange(brands.filter((b) => b.id !== id));
  };

  const addCrownMaterial = () => {
    if (crownMaterials.length >= MAX_MATERIALS) return;
    onCrownMaterialsChange([...crownMaterials, { id: makeId(), name: '' }]);
  };

  const updateCrownMaterial = (id: string, patch: Partial<MaterialOption>) => {
    onCrownMaterialsChange(crownMaterials.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const removeCrownMaterial = (id: string) => {
    onCrownMaterialsChange(crownMaterials.filter((m) => m.id !== id));
  };

  const noOptions = issues.some((x) => x.kind === 'no-implant-options');

  return (
    <Stack spacing={3}>
      <Stack>
        <Typography variant="subtitle2">
          {hidePrices ? t('implantForm.pricing.optionsTitle') : t('implantForm.pricing.sectionTitle')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {hidePrices ? t('implantForm.pricing.optionsHelp') : t('implantForm.pricing.sectionHelp')}
        </Typography>
      </Stack>

      {/* Implant brands */}
      <Box>
        <Typography
          variant="overline"
          sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1 }}
        >
          {t('implantForm.pricing.groups.brands')}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
          {t('implantForm.pricing.brandsHelp')}
        </Typography>
        <Stack spacing={1}>
          {brands.map((brand) => (
            <Stack
              key={brand.id}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              alignItems={{ sm: 'center' }}
            >
              <TextField
                label={t('implantForm.pricing.brandName')}
                value={brand.name}
                onChange={(e) => updateBrand(brand.id, e.target.value)}
                size="small"
                sx={{ flex: 1 }}
              />
              <IconButton onClick={() => removeBrand(brand.id)} size="small">
                <Icon name="delete" size={18} />
              </IconButton>
            </Stack>
          ))}
        </Stack>
        <Box mt={1}>
          <Button
            startIcon={<Icon name="add" size={17} />}
            variant="outlined"
            onClick={addBrand}
            size="small"
          >
            {t('implantForm.pricing.addBrand')}
          </Button>
        </Box>
      </Box>

      {/* Crown materials — lab-defined */}
      {!abutmentsOnly && (
        <>
          <Divider />

          <Box>
            <Typography
              variant="overline"
              sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1 }}
            >
              {t('implantForm.pricing.groups.crownMaterials')}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              {hidePrices
                ? t('implantForm.pricing.crownMaterialsNamesHelp')
                : t('implantForm.pricing.crownMaterialsHelp')}
            </Typography>
            <Stack spacing={1}>
              {crownMaterials.map((mat, i) => {
                const color = MATERIAL_COLORS[i % MATERIAL_COLORS.length];
                // As in the materials editor: a blank row is flagged once
                // another follows it, never the one just added.
                const nameError =
                  i < crownMaterials.length - 1 &&
                  issues.some((x) => x.kind === 'crown-material-name' && x.index === i);
                return (
                  <Stack
                    key={mat.id}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    alignItems={{ sm: 'center' }}
                  >
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        bgcolor: color,
                        flexShrink: 0,
                        border: 1,
                        borderColor: 'divider',
                      }}
                    />
                    <TextField
                      label={t('forms.editor.pricing.materialName')}
                      value={mat.name}
                      onChange={(e) => updateCrownMaterial(mat.id, { name: e.target.value })}
                      error={nameError}
                      helperText={nameError ? t('forms.editor.pricing.nameRequired') : undefined}
                      size="small"
                      sx={{ flex: 1 }}
                    />
                    {!hidePrices && (
                      <NumberField
                        label={t('implantForm.pricing.pricePerImplant')}
                        value={mat.unit_price}
                        onChange={(v) => updateCrownMaterial(mat.id, { unit_price: v })}
                        decimal
                        min={0}
                        InputProps={{
                          endAdornment: <InputAdornment position="end">GEL</InputAdornment>,
                        }}
                        size="small"
                        sx={{ width: 200 }}
                      />
                    )}
                    <IconButton onClick={() => removeCrownMaterial(mat.id)} size="small">
                      <Icon name="delete" size={18} />
                    </IconButton>
                  </Stack>
                );
              })}
            </Stack>
            <Box mt={1}>
              <Button
                startIcon={<Icon name="add" size={17} />}
                variant="outlined"
                onClick={addCrownMaterial}
                disabled={crownMaterials.length >= MAX_MATERIALS}
                size="small"
              >
                {t('implantForm.pricing.addCrownMaterial')}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                {crownMaterials.length} / {MAX_MATERIALS}
              </Typography>
            </Box>
          </Box>
        </>
      )}

      <Divider />

      {IMPLANT_PRICE_GROUPS.map((group) => (
        <Box key={group.titleKey}>
          <Typography
            variant="overline"
            sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1 }}
          >
            {t(group.titleKey)}
          </Typography>
          {noOptions && group.titleKey === 'implantForm.pricing.groups.abutmentType' && (
            <Typography variant="caption" color="error" display="block">
              {t('services.create.pricingIssues.noImplantOptions')}
            </Typography>
          )}
          <Stack spacing={1} mt={1}>
            {group.keys.map((key) => {
              const item: ImplantPriceItem = config[key] ?? DEFAULT_IMPLANT_PRICE_CONFIG[key];
              if (!item) return null;
              return (
                <Stack
                  key={key}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  alignItems={{ sm: 'center' }}
                >
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 180 }}>
                    {item.label}
                  </Typography>

                  {!group.hidePrice && !hidePrices && (
                    item.pricingMode === 'base_plus_per_implant' ? (
                      <>
                        <NumberField
                          label={t('implantForm.pricing.basePrice')}
                          value={item.basePrice}
                          onChange={(v) => updateItem(key, { basePrice: v ?? 0 })}
                          decimal
                          min={0}
                          InputProps={{ endAdornment: <InputAdornment position="end">GEL</InputAdornment> }}
                          size="small"
                          sx={{ width: 160 }}
                          disabled={!item.enabled}
                        />
                        <NumberField
                          label={t('implantForm.pricing.perImplantPrice')}
                          value={item.perImplantPrice}
                          onChange={(v) => updateItem(key, { perImplantPrice: v ?? 0 })}
                          decimal
                          min={0}
                          InputProps={{ endAdornment: <InputAdornment position="end">GEL</InputAdornment> }}
                          size="small"
                          sx={{ width: 160 }}
                          disabled={!item.enabled}
                        />
                      </>
                    ) : (
                      <NumberField
                        label={
                          item.pricingMode === 'per_implant'
                            ? t('implantForm.pricing.pricePerImplant')
                            : t('implantForm.pricing.fixedPrice')
                        }
                        value={item.price}
                        onChange={(v) => updateItem(key, { price: v ?? 0 })}
                        decimal
                        min={0}
                        InputProps={{ endAdornment: <InputAdornment position="end">GEL</InputAdornment> }}
                        size="small"
                        sx={{ width: 200 }}
                        disabled={!item.enabled}
                      />
                    )
                  )}

                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={item.enabled}
                        onChange={(e) => updateItem(key, { enabled: e.target.checked })}
                      />
                    }
                    label={
                      <Typography variant="caption" color="text.secondary">
                        {t('forms.editor.field.enabled')}
                      </Typography>
                    }
                    labelPlacement="start"
                    sx={{ mr: 0, gap: 0.5, flexShrink: 0 }}
                  />
                </Stack>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
