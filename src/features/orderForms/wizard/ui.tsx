import { alpha, Box, Typography, useTheme, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
import { brand, motion, palette2026, radii, surfaces } from '@/theme/tokens';
import { RequiredMark } from '../primitives';

/**
 * The redesign's field label: 12px, semibold, secondary, sentence case — not
 * `FieldLabel`'s uppercase overline, which the order form no longer uses.
 */
export function WizLabel({
  children,
  required,
  htmlFor,
  sx,
}: {
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Typography
      component={htmlFor ? 'label' : 'span'}
      {...(htmlFor ? { htmlFor } : {})}
      sx={[
        {
          display: 'block',
          fontSize: '0.75rem',
          fontWeight: 600,
          lineHeight: 1.4,
          color: 'text.secondary',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
      {required && <RequiredMark />}
    </Typography>
  );
}

/**
 * A joined row of options with the chosen one filled in ink — the redesign's
 * segmented control (patient sex, invoice recipient). Not the design system's
 * `Segmented`, which is the older sunken-track style.
 *
 * `allowDeselect`: clicking the chosen option clears it, for answers that are
 * optional (sex). Each option is a pressed/unpressed button, like the form's
 * pills, so assistive tech reads it the same way.
 */
export function InkSegmented<T extends string>({
  value,
  options,
  onChange,
  allowDeselect,
  disabled,
  height = 36,
  fullWidth,
  ariaLabel,
}: {
  value: T | '';
  options: { value: T; label: ReactNode }[];
  onChange: (value: T | '') => void;
  allowDeselect?: boolean;
  disabled?: boolean;
  height?: number;
  fullWidth?: boolean;
  ariaLabel?: string;
}) {
  const theme = useTheme();
  const edge = surfaces[theme.palette.mode].control;
  return (
    <Box
      role="group"
      aria-label={ariaLabel}
      data-clearable={allowDeselect ? 'true' : undefined}
      sx={{
        display: fullWidth ? 'flex' : 'inline-flex',
        width: fullWidth ? '100%' : undefined,
        maxWidth: '100%',
        border: 1,
        borderColor: edge,
        borderRadius: `${radii.control}px`,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <Box
            key={o.value}
            component="button"
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onChange(selected && allowDeselect ? '' : o.value)}
            sx={{
              flex: fullWidth ? 1 : undefined,
              minWidth: 0,
              height: height - 2,
              px: 1.5,
              border: 0,
              borderLeft: i === 0 ? 0 : 1,
              borderColor: edge,
              fontFamily: 'inherit',
              fontSize: '0.8125rem',
              fontWeight: selected ? 600 : 500,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: disabled ? 'default' : 'pointer',
              transition: `background-color ${motion.fast}, color ${motion.fast}`,
              bgcolor: selected ? 'primary.main' : 'transparent',
              color: selected ? 'primary.contrastText' : 'text.primary',
              '&:hover': disabled
                ? {}
                : { bgcolor: selected ? 'primary.dark' : alpha(brand.main, 0.06) },
              '&:focus-visible': {
                outline: 'none',
                boxShadow: `inset 0 0 0 2px ${alpha(brand.main, 0.55)}`,
              },
            }}
          >
            {o.label}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * The redesign's small periwinkle text link, as a button — "change", "how
 * it's calculated". `periText` rather than the brand periwinkle: the latter is
 * too light for 12–13px text on white.
 */
export function PeriLink({
  children,
  onClick,
  sx,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  sx?: SxProps<Theme>;
  'aria-expanded'?: boolean;
}) {
  const theme = useTheme();
  const light = theme.palette.mode === 'light';
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      {...rest}
      sx={[
        {
          p: 0,
          border: 0,
          bgcolor: 'transparent',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 600,
          lineHeight: 'inherit',
          cursor: 'pointer',
          color: light ? palette2026.periText : brand.soft,
          '&:hover': { textDecoration: 'underline' },
          '&:focus-visible': { outline: `2px solid ${alpha(brand.main, 0.5)}`, outlineOffset: 2 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
