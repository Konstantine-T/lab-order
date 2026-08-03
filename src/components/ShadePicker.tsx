import { Box, Stack, Typography } from '@mui/material';
import { Pill } from '@/features/orderForms/primitives';

/**
 * Approximate VITA shade colours. Reference only — never a clinical match, but
 * enough for the swatch dot the mockups put on every shade pill.
 */
const CLASSICAL: Record<string, string> = {
  A1: '#f3e7d2',
  A2: '#ecd9b6',
  A3: '#dcc196',
  'A3.5': '#cfae7e',
  A4: '#b89464',
  B1: '#f4ebd1',
  B2: '#e8d8a9',
  B3: '#d3bc7d',
  B4: '#bb9c5b',
  C1: '#dccfb6',
  C2: '#c8b790',
  C3: '#aa9669',
  C4: '#8b7849',
  D2: '#d3bfa1',
  D3: '#bca680',
  D4: '#9c855f',
};

// VITA 3D-MASTER tabs (e.g. "2M2", "3L1.5") — approximate by lightness group.
const MASTER_TONE: Record<string, string> = {
  '0': '#f6efe0',
  '1': '#f3ead6',
  '2': '#ecdcbf',
  '3': '#ddc59c',
  '4': '#c9ad7f',
  '5': '#b0925f',
};

export function shadeSwatch(label: string): string {
  const g = /^([0-5])[LMR]/.exec(label);
  if (g) return MASTER_TONE[g[1]] ?? '#dddddd';
  return CLASSICAL[label] ?? '#dddddd';
}

/** VITA classical, grouped by family — the layout the wizard mockup draws. */
export const VITA_CLASSICAL_GROUPS: { family: string; shades: string[] }[] = [
  { family: 'A', shades: ['A1', 'A2', 'A3', 'A3.5', 'A4'] },
  { family: 'B', shades: ['B1', 'B2', 'B3', 'B4'] },
  { family: 'C', shades: ['C1', 'C2', 'C3', 'C4'] },
  { family: 'D', shades: ['D2', 'D3', 'D4'] },
];

/**
 * The shade grid from the order wizard mockup: one row per family, the family
 * letter at the left, then a swatch pill per shade.
 */
export function ShadePicker({
  value,
  onChange,
  readOnly,
  groups = VITA_CLASSICAL_GROUPS,
}: {
  value: string;
  onChange: (code: string) => void;
  readOnly?: boolean;
  /** Override for other scales (e.g. VITA 3D-MASTER). */
  groups?: { family: string; shades: string[] }[];
}) {
  return (
    <Stack spacing={1}>
      {groups.map((group) => (
        <Stack key={group.family} direction="row" alignItems="center" spacing={1}>
          <Typography
            sx={{
              width: 18,
              flexShrink: 0,
              fontSize: '0.71875rem',
              fontWeight: 700,
              color: 'text.secondary',
            }}
          >
            {group.family}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {group.shades.map((s) => (
              <Pill
                key={s}
                label={s}
                swatch={shadeSwatch(s)}
                selected={value === s}
                readOnly={readOnly}
                size="small"
                onClick={() => onChange(value === s ? '' : s)}
              />
            ))}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
