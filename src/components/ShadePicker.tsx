import type { ReactElement } from 'react';
import { alpha, Box, Stack, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { brand, motion, palette2026, radii, surfaces, tone } from '@/theme/tokens';

/**
 * Approximate VITA shade colours, from the redesign's shade scheme. Reference
 * only — never a clinical match, but close enough that the tiles read as the
 * shade guide a doctor holds, rather than as a list of codes.
 */
const CLASSICAL: Record<string, string> = {
  A1: '#F3EBD9',
  A2: '#E9D9B4',
  A3: '#E0C9A0',
  'A3.5': '#D8BC8E',
  A4: '#CDAE80',
  B1: '#F2EAD3',
  B2: '#EBDDB6',
  B3: '#E3CF9E',
  B4: '#DBC48A',
  C1: '#E4DCCB',
  C2: '#D6CBB6',
  C3: '#C9BCA3',
  C4: '#BBAC91',
  D2: '#E7DAC7',
  D3: '#DCCDB6',
  D4: '#CFBEA3',
};

/**
 * VITA 3D-MASTER tabs, coloured along the guide's own axes: darker with each
 * value group, a yellow (L) or red (R) cast either side of M, and more
 * saturated as chroma rises, with the bleached 0M tabs the palest of all.
 */
const MASTER: Record<string, string> = {
  '0M1': '#F7F5F0',
  '0M2': '#F6F1E8',
  '0M3': '#F5EEDF',
  '1M1': '#EEE9E0',
  '1M2': '#EEE6D6',
  '2L1.5': '#E7E2CD',
  '2L2.5': '#EAE1C2',
  '2M1': '#E7E0D2',
  '2M2': '#E8DDC8',
  '2M3': '#EBDBBC',
  '2R1.5': '#E7DBCD',
  '2R2.5': '#EAD6C2',
  '3L1.5': '#DFD8BC',
  '3L2.5': '#E3D8AF',
  '3M1': '#DED5C2',
  '3M2': '#E1D2B5',
  '3M3': '#E5D1A8',
  '3R1.5': '#DFCEBC',
  '3R2.5': '#E3CAAF',
  '4L1.5': '#D6CBA7',
  '4L2.5': '#DBCD98',
  '4M1': '#D3C7AE',
  '4M2': '#D8C5A0',
  '4M3': '#DEC491',
  '4R1.5': '#D6BFA7',
  '4R2.5': '#DBBB98',
  '5M1': '#C7B797',
  '5M2': '#CEB686',
  '5M3': '#D6B675',
};

export function shadeSwatch(label: string): string {
  return CLASSICAL[label] ?? MASTER[label] ?? '#dddddd';
}

type ShadeGroups = { family: string; shades: string[] }[];

/** VITA classical, grouped by family — one row per family in the picker. */
export const VITA_CLASSICAL_GROUPS: ShadeGroups = [
  { family: 'A', shades: ['A1', 'A2', 'A3', 'A3.5', 'A4'] },
  { family: 'B', shades: ['B1', 'B2', 'B3', 'B4'] },
  { family: 'C', shades: ['C1', 'C2', 'C3', 'C4'] },
  { family: 'D', shades: ['D2', 'D3', 'D4'] },
];

type Hue = 'L' | 'M' | 'R';

/** A 3D-MASTER tab split into its three axes: "3R1.5" → value 3, hue R, chroma 1.5. */
type MasterShade = { code: string; value: number; hue: Hue; chroma: number };

function parseMasterShade(code: string): MasterShade | null {
  const m = /^([0-5])([LMR])([1-3](?:\.5)?)$/.exec(code);
  if (!m) return null;
  return { code, value: Number(m[1]), hue: m[2] as Hue, chroma: Number(m[3]) };
}

type MasterGroup = { value: number; columns: { hue: Hue; shades: MasterShade[] }[] };

/**
 * The 3D-MASTER grid, built from whatever tabs the caller lists: value groups
 * left to right, L / M / R columns inside each, chroma down each column. Null
 * when any code is not a 3D-MASTER tab, so a custom list falls back to rows
 * and every code a caller passes stays selectable either way.
 */
function masterLayout(groups: ShadeGroups): MasterGroup[] | null {
  const parsed = groups.flatMap((g) => g.shades).map(parseMasterShade);
  if (parsed.length === 0 || parsed.some((s) => s === null)) return null;
  const byValue = new Map<number, MasterShade[]>();
  for (const s of parsed as MasterShade[]) {
    byValue.set(s.value, [...(byValue.get(s.value) ?? []), s]);
  }
  return [...byValue.entries()]
    .sort(([a], [b]) => a - b)
    .map(([value, shades]) => ({
      value,
      columns: (['L', 'M', 'R'] as const)
        .map((hue) => ({
          hue,
          shades: shades.filter((s) => s.hue === hue).sort((a, b) => a.chroma - b.chroma),
        }))
        .filter((c) => c.shades.length > 0),
    }));
}

// Tile geometry. A column's tiles sit PITCH apart, so an L/R tab of chroma
// 1.5 lands half a step below M1, between M1 and M2, as the guide is laid out.
const TILE_W = 36;
const TILE_H = 44;
const GAP = 5;
const PITCH = TILE_H + GAP;

/**
 * The shade scheme from the redesign: a swatch tile per tab on a tinted panel,
 * with the chosen shade repeated underneath as a chip. VITA classical is one
 * row per family; a 3D-MASTER list (detected from its codes) is drawn as the
 * value / hue / chroma grid.
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
  groups?: ShadeGroups;
}) {
  const master = masterLayout(groups);
  // Clicking the chosen tile again clears it, as the pills did.
  const pick = (code: string) => onChange(value === code ? '' : code);
  const tile = (code: string) => (
    <ShadeTile
      key={code}
      code={code}
      selected={value === code}
      readOnly={readOnly}
      onClick={() => pick(code)}
    />
  );

  return (
    <Stack spacing={1.25} alignItems="flex-start">
      <Box
        // A pressed tile is an answer the doctor can take back — the order
        // wizard's section probe counts it as the section being filled.
        data-clearable="true"
        sx={{
          alignSelf: 'stretch',
          p: '14px 12px 12px',
          borderRadius: `${radii.tile}px`,
          bgcolor: (theme) => surfaces[theme.palette.mode].subtle,
        }}
      >
        {master ? <MasterGrid groups={master} tile={tile} /> : <FamilyRows groups={groups} tile={tile} />}
      </Box>
      <ChosenShade value={value} />
    </Stack>
  );
}

function FamilyRows({ groups, tile }: { groups: ShadeGroups; tile: (code: string) => ReactElement }) {
  const { t } = useTranslation('common');
  // The family legend only describes VITA classical; a lab's own list gets none.
  const vita = groups.every((g) => /^[ABCD]$/.test(g.family));
  return (
    <Stack spacing={1.25}>
      <Stack spacing={`${GAP + 1}px`}>
        {groups.map((group) => (
          <Stack key={group.family} direction="row" alignItems="center" spacing={1.25}>
            <Typography sx={{ ...axisText, width: 14, flexShrink: 0, fontWeight: 600 }}>
              {group.family}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: `${GAP}px` }}>
              {group.shades.map(tile)}
            </Box>
          </Stack>
        ))}
      </Stack>
      {vita && (
        <Typography sx={axisText}>
          {groups.map((g, i) => (
            <span key={g.family}>
              {i > 0 && ' · '}
              <Key>{g.family}</Key> — {t(`shadePicker.family.${g.family}`)}
            </span>
          ))}
        </Typography>
      )}
    </Stack>
  );
}

function MasterGrid({ groups, tile }: { groups: MasterGroup[]; tile: (code: string) => ReactElement }) {
  const { t } = useTranslation('common');
  const named: Partial<Record<number, string>> = {
    0: t('shadePicker.bleach'),
    1: t('shadePicker.light'),
    5: t('shadePicker.dark'),
  };
  return (
    <Stack spacing={1.25}>
      <Stack direction="row" justifyContent="space-between" spacing={2}>
        <Typography sx={axisText}>{t('shadePicker.lighter')}</Typography>
        <Typography sx={{ ...axisText, textAlign: 'right' }}>{t('shadePicker.valueAxis')}</Typography>
      </Stack>
      {/* Wraps on a phone: the six value groups (0M–5M) are ~540px of tiles alone. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 1.5, alignItems: 'flex-start' }}>
        {groups.map((group) => (
          <Stack key={group.value} alignItems="center" spacing={0.75}>
            <Typography sx={{ ...axisText, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {named[group.value] ? `${group.value} · ${named[group.value]}` : group.value}
            </Typography>
            <Box sx={{ display: 'flex', gap: `${GAP}px`, alignItems: 'flex-start' }}>
              {group.columns.map((col) => (
                <Box
                  key={col.hue}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: `${GAP}px`,
                    pt: `${(col.shades[0].chroma - 1) * PITCH}px`,
                  }}
                >
                  {col.shades.map((s) => tile(s.code))}
                </Box>
              ))}
            </Box>
          </Stack>
        ))}
      </Box>
      <Box sx={{ ...axisText, display: 'flex', flexWrap: 'wrap', columnGap: 1.75, rowGap: 0.25 }}>
        {(['L', 'M', 'R'] as const).map((hue) => (
          <span key={hue}>
            <Key>{hue}</Key> — {t(`shadePicker.hue.${hue}`)}
          </span>
        ))}
        <Box component="span" sx={{ ml: 'auto' }}>
          {t('shadePicker.chroma')}
        </Box>
      </Box>
    </Stack>
  );
}

function ShadeTile({
  code,
  selected,
  readOnly,
  onClick,
}: {
  code: string;
  selected: boolean;
  readOnly?: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      title={code}
      aria-pressed={selected}
      // Read-only keeps full colour so the lab can read the doctor's pick —
      // it just stops answering clicks and leaves the tab order.
      aria-disabled={readOnly || undefined}
      tabIndex={readOnly ? -1 : 0}
      onClick={() => !readOnly && onClick()}
      sx={(theme) => {
        // The design's selected tile: a 2px ring in the selection colour with
        // a thin band of card colour between it and the shade.
        const inset = `inset 0 0 0 2px ${theme.palette.background.paper}`;
        return {
          width: TILE_W,
          height: TILE_H,
          flexShrink: 0,
          p: 0,
          pb: '4px',
          display: 'inline-flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          borderRadius: '8px',
          borderStyle: 'solid',
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? 'primary.main' : surfaces[theme.palette.mode].control,
          boxShadow: selected ? inset : 'none',
          bgcolor: shadeSwatch(code),
          // The tiles are tooth-coloured in both themes, so the code is ink on
          // them in both.
          color: palette2026.ink,
          fontFamily: 'inherit',
          fontSize: '0.59375rem',
          fontWeight: 600,
          lineHeight: 1,
          cursor: readOnly ? 'default' : 'pointer',
          transition: `border-color ${motion.fast}, box-shadow ${motion.fast}`,
          '&:hover': readOnly ? {} : { borderColor: selected ? 'primary.main' : brand.main },
          '&:focus-visible': {
            outline: 'none',
            boxShadow: `0 0 0 3px ${alpha(brand.main, 0.35)}${selected ? `, ${inset}` : ''}`,
          },
        };
      }}
    >
      {code}
    </Box>
  );
}

/** The chosen shade under the scheme: aqua when set, dashed grey until then. */
function ChosenShade({ value }: { value: string }) {
  const { t } = useTranslation('common');
  const theme = useTheme();
  const done = tone('success', theme.palette.mode);
  return (
    <Box aria-live="polite">
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 28,
          px: '9px',
          borderRadius: `${radii.chipSm}px`,
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
          ...(value
            ? { bgcolor: done.bg, color: done.fg, fontWeight: 600 }
            : {
                border: '1px dashed',
                borderColor: surfaces[theme.palette.mode].dashed,
                color: 'text.secondary',
                fontWeight: 500,
              }),
        }}
      >
        {value || t('shadePicker.none')}
      </Box>
    </Box>
  );
}

/** The bold axis letter in a legend line: "L — yellowish". */
function Key({ children }: { children: string }) {
  return (
    <Box component="b" sx={{ color: 'text.primary', fontWeight: 700 }}>
      {children}
    </Box>
  );
}

const axisText = {
  fontSize: '0.75rem',
  lineHeight: 1.5,
  color: 'text.secondary',
} as const;
