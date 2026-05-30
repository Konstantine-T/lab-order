import type { ReactNode } from 'react';
import {
  alpha,
  Box,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

// ===== NumberedSection =====================================================
export function NumberedSection({
  number,
  label,
  hint,
  children,
}: {
  number: number;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            bgcolor: alpha(
              theme.palette.primary.main,
              theme.palette.mode === 'light' ? 0.12 : 0.2,
            ),
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
            letterSpacing: '0.01em',
          }}
        >
          {number}
        </Box>
        <Typography sx={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
            {hint}
          </Typography>
        )}
      </Stack>
      {children}
    </Stack>
  );
}

// ===== Pill ================================================================
export function Pill({
  label,
  selected,
  disabled,
  readOnly,
  onClick,
  size = 'medium',
}: {
  label: string;
  selected?: boolean;
  /** True when the field is genuinely disabled (greyed out, can't interact). */
  disabled?: boolean;
  /** True when we're rendering the doctor's submitted answer for the lab to
   *  view. Visually identical to interactive — full color, full contrast —
   *  but no click/hover and not focusable. */
  readOnly?: boolean;
  onClick?: () => void;
  size?: 'small' | 'medium';
}) {
  const inert = disabled || readOnly;
  return (
    <Box
      role="button"
      aria-pressed={selected}
      aria-disabled={inert || undefined}
      tabIndex={inert ? -1 : 0}
      onClick={() => !inert && onClick?.()}
      onKeyDown={(e) => {
        if (inert) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      sx={{
        px: size === 'small' ? 1.75 : 2.5,
        py: size === 'small' ? 0.5 : 0.85,
        fontSize: size === 'small' ? 13 : 14,
        fontWeight: 500,
        borderRadius: 999,
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.main' : 'background.paper',
        color: selected ? 'primary.contrastText' : 'text.primary',
        boxShadow: selected ? 0 : 1,
        cursor: inert ? 'default' : 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        // Only fade for *disabled*. Read-only stays full contrast so the lab
        // can read the doctor's selections clearly.
        opacity: disabled ? 0.6 : 1,
        transition: 'background-color 120ms, color 120ms, border-color 120ms',
        '&:hover': inert
          ? {}
          : {
              bgcolor: selected ? 'primary.dark' : 'action.hover',
              borderColor: 'primary.main',
            },
      }}
    >
      {label}
    </Box>
  );
}

// ===== PillGroup (radio-style single-select) ===============================
export function PillGroup<T extends string>({
  value,
  onChange,
  options,
  readOnly,
  size,
  getLabel,
  allowDeselect,
}: {
  value: T | '';
  onChange: (v: T) => void;
  options: readonly T[];
  readOnly?: boolean;
  size?: 'small' | 'medium';
  /** Optional label resolver — defaults to the option value itself. */
  getLabel?: (option: T) => string;
  /** When true, clicking an already-selected pill deselects it (sets value to ''). */
  allowDeselect?: boolean;
}) {
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {options.map((opt) => (
        <Pill
          key={opt}
          label={getLabel ? getLabel(opt) : opt}
          selected={value === opt}
          readOnly={readOnly}
          onClick={() => {
            if (allowDeselect && value === opt) {
              onChange('' as unknown as T);
            } else {
              onChange(opt);
            }
          }}
          size={size}
        />
      ))}
    </Stack>
  );
}

// ===== MmInput =============================================================
export function MmInput({
  value,
  onChange,
  error,
  readOnly,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  error?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const { t } = useTranslation('lab');
  return (
    <TextField
      type="number"
      value={value ?? ''}
      onChange={(e) =>
        onChange(e.target.value === '' ? null : Number(e.target.value))
      }
      placeholder={placeholder ?? t('cnbForm.mmPlaceholder')}
      error={!!error}
      InputProps={{
        readOnly: !!readOnly,
        endAdornment: (
          <InputAdornment position="end">
            <Typography variant="body2" color="text.secondary">
              mm
            </Typography>
          </InputAdornment>
        ),
      }}
      inputProps={{ step: 'any' }}
      size="small"
      sx={{ minWidth: 220 }}
    />
  );
}

// ===== ErrorHelper (red text shown above the field on submit) ==============
export function ErrorHelper({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <Typography variant="caption" color="error" sx={{ display: 'block' }} data-form-error="true">
      {children}
    </Typography>
  );
}
