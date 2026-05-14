import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
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
  TEMPLATE_CODE_CNB,
} from '@/features/orderForms/cnbTypes';
import { TEMPLATE_CODE_SG, SG_SUPPORT_TYPES } from '@/features/orderForms/sgTypes';
import type { SgSupportFee } from '@/types/database';

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
  const isCnb = templateCode === TEMPLATE_CODE_CNB;
  const isSg = templateCode === TEMPLATE_CODE_SG;

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

          {/* CnB UNIT_BASED — materials editor */}
          {pricing.model === 'UNIT_BASED' && isCnb && (
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

          {/* Generic UNIT_BASED — single global unit price */}
          {pricing.model === 'UNIT_BASED' && !isCnb && !isSg && (
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
