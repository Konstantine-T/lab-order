import {
  Box,
  Button,
  Card,
  CardContent,
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
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useTranslation } from 'react-i18next';
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
import { TEMPLATE_CODE_IMPLANT, DEFAULT_IMPLANT_PRICE_CONFIG } from '@/features/orderForms/implantTypes';
import { isFabTemplate } from '@/features/orderForms/fabTypes';
import type { SgSupportFee, ImplantPriceItem } from '@/types/database';

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

export function PricingPanel({
  pricing,
  onChange,
  // fields not used directly anymore (we no longer offer count_field selection)
  fields: _fields,
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
  const isImplant = templateCode === TEMPLATE_CODE_IMPLANT;
  const isFab = isFabTemplate(templateCode);

  const setMaterials = (next: MaterialOption[]) =>
    onChange({ ...pricing, materials: next });

  const addMaterial = () => {
    const cur = pricing.materials ?? [];
    if (cur.length >= MAX_MATERIALS) return;
    setMaterials([...cur, { id: makeId(), name: '' }]);
  };

  const updateMaterial = (id: string, patch: Partial<MaterialOption>) => {
    const cur = pricing.materials ?? [];
    setMaterials(cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const removeMaterial = (id: string) => {
    const cur = pricing.materials ?? [];
    setMaterials(cur.filter((m) => m.id !== id));
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Typography variant="h6">{t('forms.editor.pricing.title')}</Typography>

          <TextField
            select
            label={t('forms.editor.pricing.model')}
            value={pricing.model}
            onChange={(e) => onChange({ ...pricing, model: e.target.value as PricingModel })}
            fullWidth
          >
            <MenuItem value="UNIT_BASED">
              {t('forms.editor.pricing.models.UNIT_BASED')}
            </MenuItem>
            <MenuItem value="FIXED_PRICE">
              {t('forms.editor.pricing.models.FIXED_PRICE')}
            </MenuItem>
          </TextField>

          {/* CnB / ESP UNIT_BASED — materials editor */}
          {pricing.model === 'UNIT_BASED' && (isCnb || isEsp || isFab) && (
            <Stack spacing={2}>
              <Stack>
                <Typography variant="subtitle2">
                  {t('forms.editor.pricing.materialsTitle')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('forms.editor.pricing.materialsHelp')}
                </Typography>
              </Stack>

              {(pricing.materials ?? []).map((mat, i) => {
                const color = MATERIAL_COLORS[i % MATERIAL_COLORS.length];
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
                      onChange={(e) => updateMaterial(mat.id, { name: e.target.value })}
                      size="small"
                      sx={{ flex: 1 }}
                    />
                    <NumberField
                      label={t('forms.editor.pricing.materialUnitPrice')}
                      value={mat.unit_price}
                      onChange={(v) => updateMaterial(mat.id, { unit_price: v })}
                      decimal
                      min={0}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">GEL</InputAdornment>,
                      }}
                      size="small"
                      sx={{ width: 200 }}
                    />
                    <IconButton onClick={() => removeMaterial(mat.id)} size="small">
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                );
              })}

              <Box>
                <Button
                  startIcon={<AddIcon />}
                  variant="outlined"
                  onClick={addMaterial}
                  disabled={(pricing.materials ?? []).length >= MAX_MATERIALS}
                >
                  {t('forms.editor.pricing.addMaterial')}
                </Button>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 2 }}
                >
                  {(pricing.materials ?? []).length} / {MAX_MATERIALS}
                </Typography>
              </Box>

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
          {pricing.model === 'UNIT_BASED' && isImplant && (
            <ImplantPricingSection
              config={pricing.implant_price_config ?? DEFAULT_IMPLANT_PRICE_CONFIG}
              onChange={(next) => onChange({ ...pricing, implant_price_config: next })}
              brands={pricing.implant_brands ?? []}
              onBrandsChange={(next) => onChange({ ...pricing, implant_brands: next })}
              crownMaterials={pricing.implant_crown_materials ?? []}
              onCrownMaterialsChange={(next) => onChange({ ...pricing, implant_crown_materials: next })}
              t={t}
            />
          )}

          {/* Generic UNIT_BASED — single global unit price */}
          {pricing.model === 'UNIT_BASED' && !isCnb && !isSg && !isEsp && !isImplant && (
            <NumberField
              label={t('forms.editor.pricing.unitPrice')}
              value={pricing.unit_price}
              onChange={(v) => onChange({ ...pricing, unit_price: v })}
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
      </CardContent>
    </Card>
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
  config,
  onChange,
  brands,
  onBrandsChange,
  crownMaterials,
  onCrownMaterialsChange,
  t,
}: {
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

  return (
    <Stack spacing={3}>
      <Stack>
        <Typography variant="subtitle2">{t('implantForm.pricing.sectionTitle')}</Typography>
        <Typography variant="caption" color="text.secondary">
          {t('implantForm.pricing.sectionHelp')}
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
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
        <Box mt={1}>
          <Button
            startIcon={<AddIcon />}
            variant="outlined"
            onClick={addBrand}
            size="small"
          >
            {t('implantForm.pricing.addBrand')}
          </Button>
        </Box>
      </Box>

      <Divider />

      {/* Crown materials — lab-defined */}
      <Box>
        <Typography
          variant="overline"
          sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1 }}
        >
          {t('implantForm.pricing.groups.crownMaterials')}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
          {t('implantForm.pricing.crownMaterialsHelp')}
        </Typography>
        <Stack spacing={1}>
          {crownMaterials.map((mat, i) => {
            const color = MATERIAL_COLORS[i % MATERIAL_COLORS.length];
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
                  size="small"
                  sx={{ flex: 1 }}
                />
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
                <IconButton onClick={() => removeCrownMaterial(mat.id)} size="small">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            );
          })}
        </Stack>
        <Box mt={1}>
          <Button
            startIcon={<AddIcon />}
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

      <Divider />

      {IMPLANT_PRICE_GROUPS.map((group) => (
        <Box key={group.titleKey}>
          <Typography
            variant="overline"
            sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1 }}
          >
            {t(group.titleKey)}
          </Typography>
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

                  {!group.hidePrice && (
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
