import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useTranslation } from 'react-i18next';
import type { FieldConfig, FormConfiguration } from '@/types/database';

/** Input types a lab can pick for a custom-form question. Each value maps 1:1
 *  to a FieldRenderer case in DynamicForm. */
export const CUSTOM_INPUT_TYPES = [
  'text',
  'textarea',
  'number',
  'checkbox',
  'select',
  'chip_multi_select',
  'date',
] as const;
export type CustomInputType = (typeof CUSTOM_INPUT_TYPES)[number];

const CHOICE_TYPES: string[] = ['select', 'chip_multi_select'];

function makeCode(): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `q_${rnd}`;
}

/** A custom form is publishable when it has ≥1 question, every question has a
 *  non-blank label, and every choice question has ≥1 non-blank option. */
export function isCustomFormComplete(config: FormConfiguration): boolean {
  if (!config.fields.length) return false;
  return config.fields.every((f) => {
    if (!f.label.trim()) return false;
    if (CHOICE_TYPES.includes(f.type)) {
      return (f.options ?? []).some((o) => o.trim().length > 0);
    }
    return true;
  });
}

export function CustomFormBuilder({
  config,
  onChange,
}: {
  config: FormConfiguration;
  onChange: (next: FormConfiguration) => void;
}) {
  const { t } = useTranslation('lab');
  const fields = config.fields;

  const update = (i: number, patch: Partial<FieldConfig>) =>
    onChange({
      ...config,
      fields: fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    });

  const remove = (i: number) =>
    onChange({ ...config, fields: fields.filter((_, idx) => idx !== i) });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = fields.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...config, fields: next });
  };

  const add = () =>
    onChange({
      ...config,
      fields: [
        ...fields,
        {
          code: makeCode(),
          type: 'text',
          label: '',
          enabled: true,
          required: false,
          visible_to_doctor: true,
          options: [],
        },
      ],
    });

  return (
    <Stack spacing={2}>
      {fields.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('customForm.empty')}
        </Typography>
      )}
      {fields.map((f, i) => (
        <QuestionCard
          key={f.code}
          field={f}
          index={i}
          total={fields.length}
          onUpdate={(patch) => update(i, patch)}
          onRemove={() => remove(i)}
          onMove={(dir) => move(i, dir)}
        />
      ))}
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={add}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('customForm.addQuestion')}
      </Button>
    </Stack>
  );
}

function QuestionCard({
  field,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  field: FieldConfig;
  index: number;
  total: number;
  onUpdate: (patch: Partial<FieldConfig>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useTranslation('lab');
  const isChoice = CHOICE_TYPES.includes(field.type);
  const options = field.options ?? [];

  const setOption = (i: number, val: string) =>
    onUpdate({ options: options.map((o, idx) => (idx === i ? val : o)) });
  const addOption = () => onUpdate({ options: [...options, ''] });
  const removeOption = (i: number) =>
    onUpdate({ options: options.filter((_, idx) => idx !== i) });

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            label={t('customForm.questionLabel')}
            placeholder={t('customForm.questionPlaceholder')}
            value={field.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            size="small"
            fullWidth
            inputProps={{ maxLength: 300 }}
          />
          <IconButton size="small" onClick={() => onMove(-1)} disabled={index === 0}>
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
          >
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={onRemove}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>{t('customForm.inputType')}</InputLabel>
            <Select
              label={t('customForm.inputType')}
              value={field.type}
              onChange={(e) => onUpdate({ type: e.target.value })}
            >
              {CUSTOM_INPUT_TYPES.map((it) => (
                <MenuItem key={it} value={it}>
                  {t(`customForm.inputTypes.${it}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
        </Stack>

        {isChoice && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('customForm.options')}
            </Typography>
            <Stack spacing={1} sx={{ mt: 0.5 }}>
              {options.map((opt, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    size="small"
                    fullWidth
                    placeholder={t('customForm.optionPlaceholder')}
                  />
                  <IconButton size="small" color="error" onClick={() => removeOption(i)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={addOption}
                sx={{ alignSelf: 'flex-start' }}
              >
                {t('customForm.addOption')}
              </Button>
            </Stack>
          </Box>
        )}

        <TextField
          label={t('customForm.helpText')}
          value={field.helper_text ?? ''}
          onChange={(e) => onUpdate({ helper_text: e.target.value })}
          size="small"
          fullWidth
        />
      </Stack>
    </Paper>
  );
}
