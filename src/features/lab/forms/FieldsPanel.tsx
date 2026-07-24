import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useTranslation } from 'react-i18next';
import { FieldRenderer } from '@/components/DynamicForm';
import { ToothMap } from '@/components/ToothMap';
import { SHADE_GROUPS, isCnbTemplate } from '@/features/orderForms/cnbTypes';
import { TEMPLATE_CODE_SG } from '@/features/orderForms/sgTypes';
import { isModelTemplateCode } from '@/features/orderForms/modelTypes';
import { TEMPLATE_CODE_ESP } from '@/features/orderForms/espTypes';
import { TEMPLATE_CODE_IMPLANT } from '@/features/orderForms/implantTypes';
import type { FieldConfig, FormConfiguration } from '@/types/database';

export function FieldsPanel({
  config,
  onChange,
}: {
  config: FormConfiguration;
  onChange: (next: FormConfiguration) => void;
}) {
  const { t } = useTranslation('lab');
  const isStructured =
    isCnbTemplate(config._templateCode) ||
    config._templateCode === TEMPLATE_CODE_SG ||
    isModelTemplateCode(config._templateCode) ||
    config._templateCode === TEMPLATE_CODE_ESP ||
    config._templateCode === TEMPLATE_CODE_IMPLANT;

  const updateField = (i: number, patch: Partial<FieldConfig>) => {
    onChange({
      ...config,
      fields: config.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    });
  };

  const deleteField = (i: number) => {
    onChange({
      ...config,
      fields: config.fields.filter((_, idx) => idx !== i),
    });
  };

  const addCustomQuestion = () => {
    const newField: FieldConfig = {
      code: `cq_${Date.now()}`,
      type: 'custom_question',
      label: '',
      enabled: true,
      required: false,
    };
    onChange({ ...config, fields: [...config.fields, newField] });
  };

  return (
    <Stack spacing={2}>
      {isStructured && (
        <Alert severity="info">
          {config._templateCode === TEMPLATE_CODE_SG
            ? t('sgForm.fieldsLocked')
            : isModelTemplateCode(config._templateCode)
            ? t('modelForm.fieldsLocked')
            : config._templateCode === TEMPLATE_CODE_ESP
            ? t('espForm.fieldsLocked')
            : config._templateCode === TEMPLATE_CODE_IMPLANT
            ? t('implantForm.fieldsLocked')
            : t('services.edit.cnbFieldsLocked')}
        </Alert>
      )}
      {config.fields.map((field, i) => (
        <FieldCard
          key={field.code}
          field={field}
          onUpdate={(patch) => updateField(i, patch)}
          onDelete={field.type === 'custom_question' ? () => deleteField(i) : undefined}
        />
      ))}
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={addCustomQuestion}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('forms.editor.addCustomQuestion')}
      </Button>
    </Stack>
  );
}

// ─── Per-field card ──────────────────────────────────────────────────────────

function FieldCard({
  field,
  onUpdate,
  onDelete,
}: {
  field: FieldConfig;
  onUpdate: (patch: Partial<FieldConfig>) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation('lab');
  const isCustom = field.type === 'custom_question';

  return (
    <Paper
      variant="outlined"
      sx={(theme) => {
        const isOn = isCustom || field.enabled;
        const isLight = theme.palette.mode === 'light';
        return {
          borderRadius: 2,
          overflow: 'hidden',
          transition: 'opacity 0.15s, background-color 0.15s, border-color 0.15s',
          borderLeftWidth: 4,
          borderLeftStyle: 'solid',
          // Off-cards: distinctly visible gray accent, not the near-white `divider`.
          borderLeftColor: isOn
            ? 'primary.main'
            : isLight ? theme.palette.grey[500] : theme.palette.grey[700],
          // Off-cards in light mode get a darker outline so they don't blend
          // into the page background, plus a very subtle gray fill that says
          // "this exists but isn't active" without making the card unreadable.
          ...(isOn ? {} : isLight ? {
            borderColor: theme.palette.grey[400],
            backgroundColor: theme.palette.grey[50],
            opacity: 0.85,
          } : {
            borderColor: theme.palette.grey[800],
            backgroundColor: 'transparent',
            opacity: 0.6,
          }),
        };
      }}
    >
      {/* ── Header: label + on/off (or delete for custom questions) ── */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, gap: 1 }}
      >
        {isCustom ? (
          <TextField
            placeholder={t('forms.editor.field.questionPlaceholder')}
            value={field.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            size="small"
            fullWidth
            inputProps={{ maxLength: 200 }}
          />
        ) : (
          <Typography
            variant="subtitle1"
            fontWeight={600}
            color={field.enabled ? 'text.primary' : 'text.secondary'}
          >
            {t(`formFields.${field.code}`, { defaultValue: field.label })}
          </Typography>
        )}

        {isCustom ? (
          <IconButton size="small" color="error" onClick={onDelete} sx={{ flexShrink: 0 }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        ) : (
          <FormControlLabel
            control={
              <Switch
                checked={field.enabled}
                onChange={(e) => onUpdate({ enabled: e.target.checked })}
              />
            }
            label={
              <Typography variant="body2" color="text.secondary">
                {t('forms.editor.field.enabled')}
              </Typography>
            }
            labelPlacement="start"
            sx={{ mr: 0, gap: 0.5, flexShrink: 0 }}
          />
        )}
      </Stack>

      {(isCustom || field.enabled) && (
        <>
          <Divider />

          {/* ── Field preview: full component exactly as doctors see it ── */}
          <Box sx={{ px: 3, py: 3, pointerEvents: 'none', userSelect: 'none' }}>
            <FieldPreview field={field} />
          </Box>

          <Divider />

          {/* ── Config: helper text + required toggle ── */}
          <Box sx={{ px: 2, py: 2 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={3} flexWrap="wrap">
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={field.required}
                      onChange={(e) => onUpdate({ required: e.target.checked })}
                    />
                  }
                  label={t('forms.editor.field.required')}
                />
                {field.type === 'tooth_selection' && (
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={!!field.affects_price}
                        onChange={(e) => onUpdate({ affects_price: e.target.checked })}
                      />
                    }
                    label={t('forms.editor.field.affectsPrice')}
                  />
                )}
              </Stack>
            </Stack>
          </Box>
        </>
      )}
    </Paper>
  );
}

// ─── Field preview dispatcher ─────────────────────────────────────────────────

function FieldPreview({ field }: { field: FieldConfig }) {
  switch (field.type) {
    case 'cnb_treatments':
      return <ToothMap value={[]} readOnly />;

    case 'cnb_shade':
      return (
        <Stack spacing={1.5}>
          {SHADE_GROUPS.map((g) => (
            <Stack key={g.family} direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {g.shades.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  variant="outlined"
                  size="small"
                  sx={{ borderRadius: 999, fontWeight: 600, fontSize: 13 }}
                />
              ))}
            </Stack>
          ))}
        </Stack>
      );

    case 'cnb_gingival_contouring':
    case 'cnb_check_design':
      return <OptionPills options={['Yes', 'No']} />;

    case 'cnb_vertical_dimension':
      return <OptionPills options={['Keep Existing', 'Open Bite', 'Make Ideal']} />;

    case 'cnb_max_length_centrals':
      return <OptionPills options={['Ideal', 'Other']} />;

    case 'cnb_occlusal_contact':
      return <OptionPills options={['Tight', 'Zero', 'Relief']} />;

    case 'cnb_rx_notes':
      return (
        <TextField
          multiline
          minRows={3}
          fullWidth
          disabled
          placeholder="Notes…"
          InputProps={{ readOnly: true }}
        />
      );

    case 'esp_treatments':
      return <ToothMap value={[]} readOnly />;

    case 'esp_shade':
      return (
        <Stack spacing={1.5}>
          {SHADE_GROUPS.map((g) => (
            <Stack key={g.family} direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {g.shades.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  variant="outlined"
                  size="small"
                  sx={{ borderRadius: 999, fontWeight: 600, fontSize: 13 }}
                />
              ))}
            </Stack>
          ))}
        </Stack>
      );

    case 'esp_misalignment':
      return <OptionPills options={['As much as possible', 'Other']} />;

    case 'esp_gingival':
      return <OptionPills options={['Yes', 'No']} />;

    case 'esp_vertical_dimension':
      return <OptionPills options={['Keep Existing', 'Open Bite', 'Make Ideal']} />;

    case 'esp_max_length':
      return <OptionPills options={['Ideal', 'Other']} />;

    case 'esp_smile_type':
      return (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {['High Smile Line', 'Medium Smile Line', 'Low Smile Line', 'Gummy Smile', 'Duchenne Smile', 'Non-Duchenne Smile', 'Commissure Smile', 'Cuspid Smile', 'Complex Smile', 'Mona Lisa Smile', 'Canine Smile', 'Full Denture Smile'].map((s) => (
            <Chip key={s} label={s} variant="outlined" size="small" sx={{ borderRadius: 999, fontWeight: 500 }} />
          ))}
        </Stack>
      );

    case 'esp_notes':
      return (
        <TextField
          multiline
          minRows={2}
          fullWidth
          disabled
          placeholder="Notes…"
          InputProps={{ readOnly: true }}
        />
      );

    case 'model_type':
      return <OptionPills options={['Base Model', 'Implant Model', 'Ortho Model']} />;

    case 'model_articulator':
    case 'model_prepared_dies':
      return <OptionPills options={['Yes', 'No']} />;

    case 'model_arch':
      return <OptionPills options={['Upper', 'Lower', 'Both']} />;

    case 'model_base_type':
      return <OptionPills options={['Hollow', 'Solid']} />;

    case 'model_markings':
    case 'model_notes':
      return (
        <TextField
          multiline
          minRows={2}
          fullWidth
          disabled
          placeholder={field.type === 'model_notes' ? 'Notes…' : 'Describe any markings…'}
          InputProps={{ readOnly: true }}
        />
      );

    case 'grg_additive_wax_up':
    case 'grg_approval_needed':
      return <OptionPills options={['Yes', 'No']} />;

    case 'grg_notes':
      return (
        <TextField
          multiline
          minRows={2}
          fullWidth
          disabled
          placeholder="Notes…"
          InputProps={{ readOnly: true }}
        />
      );

    case 'custom_question':
      return (
        <TextField
          label={field.label || '…'}
          disabled
          fullWidth
          inputProps={{ maxLength: 200 }}
        />
      );

    default:
      // Generic field types (text, textarea, select, shade_picker, tooth_selection, etc.)
      return (
        <FieldRenderer
          field={field}
          value={undefined}
          onChange={() => {}}
          readOnly
        />
      );
  }
}

function OptionPills({ options }: { options: readonly string[] }) {
  const { t } = useTranslation('lab');
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {options.map((opt) => (
        <Chip
          key={opt}
          label={t(`cnbForm.options.${opt}`, { defaultValue: opt })}
          variant="outlined"
          sx={{ borderRadius: 999, fontWeight: 500 }}
        />
      ))}
    </Stack>
  );
}
