import {
  Chip,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { ToothMap } from './ToothMap';
import type { FieldConfig, FormConfiguration } from '@/types/database';

const SHADE_OPTIONS = [
  'A1', 'A2', 'A3', 'A3.5', 'A4',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4',
  'D2', 'D3', 'D4',
];

const MATERIAL_OPTIONS = ['Standard zirconia', 'Premium zirconia', 'PMMA', 'E.max', 'Other'];

type Props = {
  configuration: FormConfiguration;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  errors?: Record<string, string>;
  readOnly?: boolean;
};

export function DynamicForm({ configuration, values, onChange, errors, readOnly }: Props) {
  const setField = (code: string, val: unknown) => {
    onChange({ ...values, [code]: val });
  };

  const visibleFields = configuration.fields.filter(
    (f) => f.enabled && f.visible_to_doctor !== false,
  );

  return (
    <Stack spacing={3}>
      {visibleFields.map((f) => (
        <FieldRenderer
          key={f.code}
          field={f}
          value={values[f.code]}
          onChange={(v) => setField(f.code, v)}
          error={errors?.[f.code]}
          readOnly={readOnly}
        />
      ))}
    </Stack>
  );
}

export function FieldRenderer({
  field,
  value,
  onChange,
  error,
  readOnly,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  readOnly?: boolean;
}) {
  const helper = error ?? field.helper_text;

  switch (field.type) {
    case 'custom_question':
    case 'text':
      return (
        <TextField
          label={`${field.label}${field.required ? ' *' : ''}`}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          helperText={helper}
          error={!!error}
          InputProps={{ readOnly: !!readOnly }}
          inputProps={field.type === 'custom_question' ? { maxLength: 200 } : undefined}
          fullWidth
        />
      );
    case 'textarea':
      return (
        <TextField
          label={`${field.label}${field.required ? ' *' : ''}`}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          helperText={helper}
          error={!!error}
          InputProps={{ readOnly: !!readOnly }}
          multiline
          minRows={3}
          fullWidth
        />
      );
    case 'number':
      return (
        <TextField
          label={`${field.label}${field.required ? ' *' : ''}`}
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          helperText={helper}
          error={!!error}
          InputProps={{ readOnly: !!readOnly }}
          fullWidth
        />
      );
    case 'select': {
      const options = field.options ?? [];
      return (
        <FormControl fullWidth error={!!error}>
          <InputLabel>
            {field.label}
            {field.required ? ' *' : ''}
          </InputLabel>
          <Select
            label={`${field.label}${field.required ? ' *' : ''}`}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            readOnly={!!readOnly}
          >
            <MenuItem value="">
              <em>—</em>
            </MenuItem>
            {options.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </Select>
          {helper && <FormHelperText>{helper}</FormHelperText>}
        </FormControl>
      );
    }
    case 'shade_picker':
      return (
        <FormControl fullWidth error={!!error}>
          <InputLabel>
            {field.label}
            {field.required ? ' *' : ''}
          </InputLabel>
          <Select
            label={`${field.label}${field.required ? ' *' : ''}`}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            readOnly={!!readOnly}
          >
            <MenuItem value="">
              <em>—</em>
            </MenuItem>
            {SHADE_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
          {helper && <FormHelperText>{helper}</FormHelperText>}
        </FormControl>
      );
    case 'material_select':
      return (
        <FormControl fullWidth error={!!error}>
          <InputLabel>
            {field.label}
            {field.required ? ' *' : ''}
          </InputLabel>
          <Select
            label={`${field.label}${field.required ? ' *' : ''}`}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            readOnly={!!readOnly}
          >
            <MenuItem value="">
              <em>—</em>
            </MenuItem>
            {MATERIAL_OPTIONS.map((m) => (
              <MenuItem key={m} value={m}>
                {m}
              </MenuItem>
            ))}
          </Select>
          {helper && <FormHelperText>{helper}</FormHelperText>}
        </FormControl>
      );
    case 'tooth_selection':
      return (
        <Stack spacing={1}>
          <Typography variant="subtitle2">
            {field.label}
            {field.required ? ' *' : ''}
          </Typography>
          <ToothMap
            value={(value as number[]) ?? []}
            onChange={readOnly ? undefined : onChange}
            readOnly={readOnly}
          />
          {helper && (
            <Typography variant="caption" color={error ? 'error' : 'text.secondary'}>
              {helper}
            </Typography>
          )}
        </Stack>
      );
    case 'chip_multi_select': {
      const selected: string[] = Array.isArray(value) ? (value as string[]) : [];
      const options = field.options ?? [];
      const toggle = (opt: string) => {
        if (readOnly) return;
        onChange(
          selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt],
        );
      };
      return (
        <Stack spacing={1}>
          <Typography variant="subtitle2">
            {field.label}
            {field.required ? ' *' : ''}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {options.map((opt) => {
              const isSel = selected.includes(opt);
              return (
                <Chip
                  key={opt}
                  label={opt}
                  color={isSel ? 'primary' : 'default'}
                  variant={isSel ? 'filled' : 'outlined'}
                  onClick={readOnly ? undefined : () => toggle(opt)}
                  clickable={!readOnly}
                  sx={{ height: 36, fontSize: 14, px: 1 }}
                />
              );
            })}
          </Stack>
          {helper && (
            <Typography variant="caption" color={error ? 'error' : 'text.secondary'}>
              {helper}
            </Typography>
          )}
        </Stack>
      );
    }
    case 'checkbox':
      return (
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              disabled={readOnly}
            />
          }
          label={field.label}
        />
      );
    default:
      return (
        <TextField
          label={`${field.label}${field.required ? ' *' : ''}`}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          helperText={helper}
          error={!!error}
          InputProps={{ readOnly: !!readOnly }}
          fullWidth
        />
      );
  }
}

export function validateFormAnswers(
  configuration: FormConfiguration,
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of configuration.fields) {
    if (!f.enabled || !f.required) continue;
    const v = values[f.code];
    const empty =
      v === undefined ||
      v === null ||
      v === '' ||
      (Array.isArray(v) && v.length === 0);
    if (empty) errors[f.code] = 'Required';
  }
  return errors;
}
