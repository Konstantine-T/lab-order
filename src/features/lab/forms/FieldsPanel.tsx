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
import { SHADE_GROUPS, TEMPLATE_CODE_CNB } from '@/features/orderForms/cnbTypes';
import { TEMPLATE_CODE_SG } from '@/features/orderForms/sgTypes';
import { TEMPLATE_CODE_MODEL } from '@/features/orderForms/modelTypes';
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
    config._templateCode === TEMPLATE_CODE_CNB ||
    config._templateCode === TEMPLATE_CODE_SG ||
    config._templateCode === TEMPLATE_CODE_MODEL;

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
            : config._templateCode === TEMPLATE_CODE_MODEL
            ? t('modelForm.fieldsLocked')
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
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        opacity: isCustom || field.enabled ? 1 : 0.5,
        transition: 'opacity 0.15s',
        borderLeftWidth: 4,
        borderLeftStyle: 'solid',
        borderLeftColor: isCustom || field.enabled ? 'primary.main' : 'divider',
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
            color={field.enabled ? 'text.primary' : 'text.disabled'}
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
              {!isCustom && (
                <TextField
                  label={t('forms.editor.field.helperText')}
                  value={field.helper_text ?? ''}
                  onChange={(e) => onUpdate({ helper_text: e.target.value })}
                  size="small"
                  fullWidth
                />
              )}
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
