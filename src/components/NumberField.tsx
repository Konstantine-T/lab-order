import { useEffect, useRef, useState } from 'react';
import { TextField, type TextFieldProps } from '@mui/material';

type Props = Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & {
  /** Numeric value or undefined when the field is empty. */
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  /** Optional clamps. Out-of-range entries are accepted while typing but
   *  clamped on blur so the parent state never holds an invalid number. */
  min?: number;
  max?: number;
  /** Allow non-integer values. Default: integer. */
  decimal?: boolean;
};

/**
 * MUI TextField wrapper for numeric inputs with sane UX:
 *  - Empty value renders as an empty input (not "0").
 *  - Backspacing the last digit leaves the input empty (parent gets `undefined`).
 *  - Min/max are enforced on blur so transient out-of-range values during
 *    typing don't snap unexpectedly.
 *  - Local string state lets the user type partial numbers like ".5" or "12."
 *    without the controlled value re-formatting under their cursor.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  decimal,
  inputProps,
  ...rest
}: Props) {
  const fmt = (n: number | undefined) =>
    n === undefined || Number.isNaN(n) ? '' : String(n);

  // Track the displayed string so the user can type freely. Sync from props
  // only when the prop's number truly diverges from what the local string
  // represents (e.g. an external reset).
  const [draft, setDraft] = useState<string>(() => fmt(value));
  const lastEmitted = useRef<number | undefined>(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setDraft(fmt(value));
      lastEmitted.current = value;
    }
  }, [value]);

  const allowedRe = decimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;

  const emit = (raw: string) => {
    if (raw === '' || raw === '-' || raw === '.') {
      lastEmitted.current = undefined;
      onChange(undefined);
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    lastEmitted.current = n;
    onChange(n);
  };

  return (
    <TextField
      {...rest}
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        if (!allowedRe.test(raw)) return;
        setDraft(raw);
        emit(raw);
      }}
      onBlur={(e) => {
        // Clamp on blur: if user left the input mid-edit ("." or "-"), reset
        // to empty; if numeric, clamp to [min, max] when set.
        if (draft === '' || draft === '-' || draft === '.') {
          setDraft('');
          lastEmitted.current = undefined;
          onChange(undefined);
        } else {
          let n = Number(draft);
          if (Number.isNaN(n)) {
            setDraft('');
            lastEmitted.current = undefined;
            onChange(undefined);
          } else {
            if (min != null && n < min) n = min;
            if (max != null && n > max) n = max;
            setDraft(String(n));
            lastEmitted.current = n;
            onChange(n);
          }
        }
        rest.onBlur?.(e);
      }}
      inputProps={{
        inputMode: decimal ? 'decimal' : 'numeric',
        // Browsers honor pattern as a hint; the regex on input is the real gate.
        ...inputProps,
      }}
    />
  );
}
