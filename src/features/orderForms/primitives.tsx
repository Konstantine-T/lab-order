import { createContext, useContext, type ReactNode } from 'react';
import { alpha, Box, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { SectionCard } from '@/components/design';
import { FieldRenderer } from '@/components/DynamicForm';
import type { FieldConfig } from '@/types/database';
import { brand, motion, radii } from '@/theme/tokens';

/**
 * How a form's numbered sections should be chrome'd.
 *
 * `card` is the wizard: every section is its own white card, as the mockups
 * draw them. `plain` is the read-only rendering on an order detail screen,
 * where all sections already sit inside one "Order details" card.
 */
const SectionChromeContext = createContext<'card' | 'plain'>('plain');
export const SectionChrome = SectionChromeContext.Provider;

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
  const chrome = useContext(SectionChromeContext);

  if (chrome === 'card') {
    return (
      <SectionCard step={number} title={label} meta={hint}>
        {children}
      </SectionCard>
    );
  }

  return (
    <Stack spacing={1.75}>
      <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap">
        <Box
          sx={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            bgcolor: alpha(brand.main, 0.13),
            color: 'primary.dark',
            display: 'grid',
            placeItems: 'center',
            fontSize: '0.78125rem',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {number}
        </Box>
        <Typography
          sx={{ fontSize: '0.96875rem', fontWeight: 700, letterSpacing: '-0.01em' }}
        >
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
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
  swatch,
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
  /** Colour dot before the label — a material or a shade swatch. */
  swatch?: string;
}) {
  const inert = disabled || readOnly;
  const md = size === 'medium';
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
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.875,
        px: md ? 2.25 : 1.75,
        py: md ? 1 : 0.75,
        fontSize: md ? '0.84375rem' : '0.78125rem',
        fontWeight: 600,
        lineHeight: 1.3,
        borderRadius: `${radii.pill}px`,
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.main' : 'background.paper',
        color: selected ? 'primary.contrastText' : 'text.primary',
        cursor: inert ? 'default' : 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        // Only fade for *disabled*. Read-only stays full contrast so the lab
        // can read the doctor's selections clearly.
        opacity: disabled ? 0.5 : 1,
        transition: `all ${motion.fast}`,
        '&:hover': inert
          ? {}
          : {
              bgcolor: selected ? 'primary.dark' : alpha(brand.main, 0.06),
              borderColor: 'primary.main',
            },
        '&:focus-visible': {
          outline: 'none',
          boxShadow: `0 0 0 3px ${alpha(brand.main, 0.28)}`,
        },
      }}
    >
      {swatch && (
        <Box
          component="span"
          sx={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            bgcolor: swatch,
            border: '1px solid rgba(0,0,0,0.15)',
            flexShrink: 0,
          }}
        />
      )}
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
  getSwatch,
  allowDeselect,
}: {
  value: T | '';
  onChange: (v: T) => void;
  options: readonly T[];
  readOnly?: boolean;
  size?: 'small' | 'medium';
  /** Optional label resolver — defaults to the option value itself. */
  getLabel?: (option: T) => string;
  /** Optional colour dot resolver, for material / shade pickers. */
  getSwatch?: (option: T) => string | undefined;
  /** When true, clicking an already-selected pill deselects it (sets value to ''). */
  allowDeselect?: boolean;
}) {
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
      {options.map((opt) => (
        <Pill
          key={opt}
          label={getLabel ? getLabel(opt) : opt}
          selected={value === opt}
          readOnly={readOnly}
          swatch={getSwatch?.(opt)}
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

// ===== CustomQuestionSections ==============================================
/**
 * The lab's own appended questions, rendered as first-class numbered sections
 * at the end of a template form.
 *
 * It lives here, and is rendered *inside* each template form, because the
 * section number has to come from the same counter the template's own sections
 * use. Rendering it as a sibling in `OrderForm` — which is where it used to
 * live, as a bare `DynamicForm` — meant the questions had no number at all and
 * read as a footnote under the numbered list.
 *
 * Sharing the counter through context instead would drift: a template form
 * holds its own local state (the selected material, say), so it re-renders
 * alone, without resetting a counter owned by the parent. Every material click
 * would push the numbers up.
 */
export function CustomQuestionSections({
  configuration,
  values,
  onChange,
  readOnly,
  errors,
  startNumber,
}: {
  configuration: { fields: FieldConfig[] };
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readOnly?: boolean;
  errors?: Record<string, string>;
  /**
   * The last section number the template itself used. Deliberately a number
   * and not the template's `next()`: calling that from inside this render
   * would bump the counter once per render of *this* component, which React
   * StrictMode does twice — the question came out numbered 8 under a template
   * whose own sections ended at 6.
   */
  startNumber: number;
}) {
  const custom = configuration.fields.filter(
    (f) => f.type === 'custom_question' && f.enabled && f.visible_to_doctor !== false,
  );
  if (custom.length === 0) return null;

  return (
    <>
      {custom.map((f, i) => (
        <NumberedSection
          key={f.code}
          number={startNumber + i + 1}
          label={`${f.label}${f.required ? ' *' : ''}`}
        >
          <FieldRenderer
            field={f}
            value={values[f.code]}
            onChange={(v) => onChange({ ...values, [f.code]: v })}
            error={errors?.[f.code]}
            readOnly={readOnly}
            // The question is the heading now.
            hideLabel
          />
        </NumberedSection>
      ))}
    </>
  );
}
