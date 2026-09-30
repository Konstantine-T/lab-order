import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  alpha,
  Box,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useTheme,
  type SxProps,
  type Theme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { FieldRenderer } from '@/components/DynamicForm';
import type { FieldConfig } from '@/types/database';
import { brand, motion, palette2026, radii, surfaces, tone } from '@/theme/tokens';
import {
  probeSection,
  useRegisterSection,
  useSectionDone,
} from './wizard/sectionRegistry';

/**
 * How a form's numbered sections should be chrome'd.
 *
 * `card` is the wizard: every section is its own white card, as the mockups
 * draw them. `plain` is the read-only rendering on an order detail screen,
 * where all sections already sit inside one "Order details" card.
 */
const SectionChromeContext = createContext<'card' | 'plain'>('plain');
export const SectionChrome = SectionChromeContext.Provider;

/**
 * Set inside a section card. The implant form nests the whole crown-and-bridge
 * form in one of its sections; those inner sections are still drawn, but only
 * the outer one is a stop in the page's navigator — otherwise it would list
 * "5 · crown restoration" followed by a second "1 · treatment".
 */
const InSectionContext = createContext(false);

/**
 * The column a template's numbered sections stack in: the redesign's 14px
 * between cards, or the wider rhythm the plain read-only rendering needs to
 * separate sections that have no card edge.
 */
export function SectionStack({ children }: { children: ReactNode }) {
  const chrome = useContext(SectionChromeContext);
  return <Stack spacing={chrome === 'card' ? 1.75 : 4}>{children}</Stack>;
}

/** A trailing "*" is how every template marks a required section's label. */
const REQUIRED_MARK = /\s*\*\s*$/;

// ===== SectionBadge ========================================================
/**
 * The redesign's section marker: a 24px rounded square holding the section's
 * number — or "3–7" for a grouped card — that turns aqua with a tick once the
 * section is done. Exported for the wizard's own cards (patient, files), so
 * every card on the page carries the same marker.
 */
export function SectionBadge({
  children,
  done,
}: {
  /** The number, or an icon for an unnumbered card. */
  children?: ReactNode;
  done?: boolean;
}) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  return (
    <Box
      component="span"
      sx={{
        minWidth: 24,
        height: 24,
        px: 0.5,
        flexShrink: 0,
        borderRadius: `${radii.chipSm}px`,
        display: 'inline-grid',
        placeItems: 'center',
        fontSize: '0.75rem',
        fontWeight: 700,
        lineHeight: 1,
        transition: `background-color ${motion.base}, color ${motion.base}`,
        bgcolor: done ? palette2026.aqua : surfaces[mode].chip,
        color: done ? '#FFFFFF' : tone('info', mode).fg,
      }}
    >
      {done ? <Icon name="check" size={15} sx={{ fontWeight: 700 }} /> : children}
    </Box>
  );
}

/** The periwinkle asterisk the redesign puts after a required label. */
export function RequiredMark() {
  return (
    <Box component="span" aria-hidden sx={{ color: palette2026.peri, fontWeight: 600, ml: 0.5 }}>
      *
    </Box>
  );
}

// ===== SectionCardShell ====================================================
/**
 * The order form's white section card, per the redesign: 12px corners, a
 * hairline edge, a header row of badge + title (+ an inline muted hint, and
 * controls pushed to the right), then the content.
 *
 * Exported so the wizard's own cards share the exact chrome — the patient and
 * files cards are not numbered sections, but they sit in the same column.
 */
export function SectionCardShell({
  id,
  badge,
  title,
  hint,
  actions,
  children,
  sx,
  cardRef,
}: {
  id?: string;
  badge?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  sx?: SxProps<Theme>;
  cardRef?: Ref<HTMLElement>;
}) {
  const theme = useTheme();
  return (
    <Box
      component="section"
      id={id}
      ref={cardRef}
      aria-label={typeof title === 'string' ? title : undefined}
      sx={[
        {
          bgcolor: 'background.paper',
          border: 1,
          borderColor: surfaces[theme.palette.mode].borderSolid,
          borderRadius: `${radii.card}px`,
          px: { xs: 2, sm: 3 },
          pt: { xs: 2, sm: 2.5 },
          pb: { xs: 2.25, sm: 2.75 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.75,
          // A card can be the target of the navigator's scroll; a stray focus
          // ring from that would read as an error highlight.
          '&:focus': { outline: 'none' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Stack direction="row" alignItems="center" sx={{ gap: 1.25, flexWrap: 'wrap', minWidth: 0 }}>
        {badge}
        <Typography
          component="h2"
          sx={{
            fontSize: '0.9375rem',
            fontWeight: 600,
            lineHeight: 1.35,
            minWidth: 0,
            // Grows into the row and wraps its own text, rather than dropping
            // under the badge; a header control that no longer fits beside a
            // ~12rem title moves to the next line instead.
            flex: '1 1 12rem',
          }}
        >
          {title}
          {hint && (
            <Box
              component="span"
              sx={{ ml: 0.75, fontSize: '0.8125rem', fontWeight: 400, color: 'text.secondary' }}
            >
              — {hint}
            </Box>
          )}
        </Typography>
        {actions && (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            {actions}
          </Box>
        )}
      </Stack>
      {children}
    </Box>
  );
}

// ===== NumberedSection =====================================================
/**
 * One numbered section of a clinical form.
 *
 * In the wizard (`card` chrome) it is its own card, and it reports itself to
 * the page's section navigator — see `wizard/sectionRegistry`. The optional
 * props below exist for that navigator; a template that passes none of them
 * still gets a correct list, just with less exact progress:
 *
 * - `done`: the template's own answer to "is this section complete". Without
 *   it a required section counts as done once the whole form validates (or,
 *   after a submit attempt, once it shows no error), and an optional one once
 *   it holds an answer.
 * - `required`: defaults to the label ending in "*", which is how every
 *   template marks it.
 * - `navLabel`: a shorter name for the navigator ("მკურნალობა" for
 *   "მკურნალობის დამატება"); defaults to the label.
 */
export function NumberedSection({
  number,
  label,
  hint,
  children,
  done,
  required,
  navLabel,
  actions,
}: {
  /** A number, or a range string such as "3–7" for a grouped card. */
  number: number | string;
  label: string;
  hint?: string;
  children: ReactNode;
  done?: boolean;
  required?: boolean;
  navLabel?: string;
  /** Controls at the right of the header row — a notation or scale toggle. */
  actions?: ReactNode;
}) {
  const chrome = useContext(SectionChromeContext);
  const isCard = chrome === 'card';
  const nested = useContext(InSectionContext);
  const id = `order-section-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ref = useRef<HTMLElement | null>(null);
  const [probe, setProbe] = useState({ filled: false, invalid: false });

  const plainLabel = label.replace(REQUIRED_MARK, '');
  const isRequired = required ?? REQUIRED_MARK.test(label);
  const name = navLabel ?? plainLabel;

  // After every render: the section's answers live in the template's state,
  // so each change re-renders this and the probe re-reads the DOM. No deps on
  // purpose; the state only changes when the probe does, so it settles.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isCard) return;
    const next = probeSection(ref.current);
    setProbe((prev) =>
      prev.filled === next.filled && prev.invalid === next.invalid ? prev : next,
    );
  });

  useRegisterSection(
    isCard && !nested
      ? {
          id,
          kind: 'form',
          label: `${number} · ${name}`,
          name,
          required: isRequired,
          done,
          filled: probe.filled,
          invalid: probe.invalid,
        }
      : null,
  );
  const resolvedDone = useSectionDone(id) ?? done;

  if (isCard) {
    return (
      <SectionCardShell
        id={id}
        cardRef={ref}
        badge={<SectionBadge done={resolvedDone}>{number}</SectionBadge>}
        title={
          <>
            {plainLabel}
            {isRequired && <RequiredMark />}
          </>
        }
        hint={hint}
        actions={actions}
      >
        <InSectionContext.Provider value={true}>{children}</InSectionContext.Provider>
      </SectionCardShell>
    );
  }

  return (
    <Stack spacing={1.75}>
      <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap">
        {/* A rounded square rather than a circle, as the redesign draws it —
            and one that can widen, since a grouped section is numbered "3–7". */}
        <Box
          sx={{
            minWidth: 26,
            height: 26,
            px: 0.75,
            borderRadius: `${radii.chipSm}px`,
            bgcolor: alpha(brand.main, 0.13),
            color: brand.strong,
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
    <Stack
      direction="row"
      // Marks the pressed pill as a real answer for the wizard's section
      // probe: a group the doctor can clear is a question, not a mode toggle.
      data-clearable={allowDeselect ? 'true' : undefined}
      sx={{ flexWrap: 'wrap', gap: 1 }}
    >
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

/** Empty the way `validateFormAnswers` counts it: nothing, '' or []. */
function isAnswered(v: unknown): boolean {
  return !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0));
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
          // Exact, and the same emptiness rule `validateFormAnswers` applies.
          done={isAnswered(values[f.code])}
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
