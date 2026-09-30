import { useEffect, useMemo } from 'react';
import { alpha, Alert, Box, Stack, TextField, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ToothMap, toDisplayLabel } from '@/components/ToothMap';
import { Icon, CopyAdornment } from '@/components/design';
import { calculatePrice, formatGELShort } from '@/utils/pricing';
import { brand, motion, palette2026, radii, surfaces, tone } from '@/theme/tokens';
import { ErrorHelper } from './primitives';
import {
  materialColor,
  type CnbNotation,
  type CnbToothAssignment,
} from './cnbTypes';
import type { MaterialOption } from '@/types/database';

type Props = {
  /** Lab-defined materials (from pricing config). */
  materials: MaterialOption[];
  toothAssignments: CnbToothAssignment[];
  notation: CnbNotation;
  notes: string;
  /** Currently-selected material id (parent-controlled). */
  selectedMaterialId: string | null;
  onSelectMaterial: (id: string) => void;
  onAssignmentsChange: (next: CnbToothAssignment[]) => void;
  onNotationChange: (n: CnbNotation) => void;
  onNotesChange: (s: string) => void;
  readOnly?: boolean;
  error?: string;
  /** Teeth to display with a filled dot instead of the number (e.g. implant positions). */
  markedTeeth?: number[];
  /**
   * Whether the order is priced per tooth by material — the caller's
   * `pricing?.model === 'UNIT_BASED'`. A lab can switch a service to a fixed,
   * described or no price and keep its old material list; those unit prices
   * are then not what the order costs, so none are shown. Defaults to true,
   * which is how the material prices were always shown.
   */
  pricedPerTooth?: boolean;
  /**
   * The caller shows `NotationToggle` in its section header, as the design
   * draws it, so the builder leaves its own out.
   */
  notationInHeader?: boolean;
};

const NOTATIONS: readonly CnbNotation[] = ['Universal', 'FDI'];
/** What the chart is handed as its `value` — see `toothColors` for why. */
const NO_TEETH: number[] = [];

export function TreatmentBuilder({
  materials,
  toothAssignments,
  notation,
  notes,
  selectedMaterialId,
  onSelectMaterial,
  onAssignmentsChange,
  onNotationChange,
  onNotesChange,
  readOnly,
  error,
  markedTeeth,
  pricedPerTooth = true,
  notationInHeader,
}: Props) {
  const { t } = useTranslation('lab');
  const theme = useTheme();
  const mode = theme.palette.mode;
  const aqua = tone('success', mode);

  const materialById = useMemo(
    () => new Map(materials.map((m, i) => [m.id, { ...m, color: materialColor(i) }])),
    [materials],
  );

  // Every assigned tooth gets its fill from here, including a legacy one with
  // no material (aqua, as a plain selected tooth). That lets the chart below
  // take an empty `value`: ToothMap prints its own "upper / lower / total"
  // capsule row for whatever `value` holds, and the per-tooth chips under it
  // already say all of that and more. The fill is the same either way — a
  // colour override wins over the selected state inside ToothMap.
  const toothColors = useMemo(() => {
    const m: Record<number, string> = {};
    for (const a of toothAssignments) {
      m[a.tooth] = materialById.get(a.materialId)?.color ?? palette2026.aqua;
    }
    return m;
  }, [toothAssignments, materialById]);

  // One chip per tooth, walked round the arch (Universal order). The price is
  // the tooth's material `unit_price`, which is exactly what `calculatePrice`
  // adds for it — pontics included, there is no separate rate. No number
  // means no price part, rather than a made-up 0.
  const teeth = useMemo(
    () =>
      [...toothAssignments]
        .sort((a, b) => a.tooth - b.tooth)
        .map((a) => {
          const mat = materialById.get(a.materialId);
          const price =
            pricedPerTooth && typeof mat?.unit_price === 'number' && Number.isFinite(mat.unit_price)
              ? mat.unit_price
              : null;
          return { tooth: a.tooth, name: mat?.name, color: mat?.color ?? palette2026.aqua, price };
        }),
    [toothAssignments, materialById, pricedPerTooth],
  );

  // The treatment's own subtotal, from the one function that prices orders —
  // fed only this block's config and answers, so the rail's extras (rush, the
  // Evident Smile gingival guide, implant parts) stay out of it.
  const subtotal = useMemo(
    () =>
      teeth.some((x) => x.price !== null)
        ? calculatePrice({ model: 'UNIT_BASED', materials, rush: { type: 'NONE' } }, { toothAssignments })
            .subtotal
        : null,
    [teeth, materials, toothAssignments],
  );

  // A swatch on each chip only earns its place when the chart is actually
  // painted in more than one colour — then it is the legend.
  const mixed = new Set(toothAssignments.map((a) => a.materialId)).size > 1;

  // Auto-select the first material on first render once we have any.
  useEffect(() => {
    if (readOnly) return;
    if (!selectedMaterialId && materials.length > 0) {
      onSelectMaterial(materials[0].id);
    }
  }, [readOnly, selectedMaterialId, materials, onSelectMaterial]);

  const handleToothClick = (n: number) => {
    if (readOnly || !selectedMaterialId) return;
    const existing = toothAssignments.find((a) => a.tooth === n);
    if (existing && existing.materialId === selectedMaterialId) {
      // Same material clicked twice → unassign
      onAssignmentsChange(toothAssignments.filter((a) => a.tooth !== n));
    } else if (existing) {
      // Different material → reassign
      onAssignmentsChange(
        toothAssignments.map((a) =>
          a.tooth === n ? { ...a, materialId: selectedMaterialId } : a,
        ),
      );
    } else {
      onAssignmentsChange([
        ...toothAssignments,
        { tooth: n, materialId: selectedMaterialId },
      ]);
    }
  };

  if (materials.length === 0) {
    return <Alert severity="warning">{t('cnbForm.builder.noMaterials')}</Alert>;
  }

  const ctrl = surfaces[mode].control;
  const focusVisible = {
    outline: 'none',
    boxShadow: `0 0 0 3px ${alpha(brand.main, 0.28)}`,
  };

  return (
    <Stack spacing={1.75}>
      {/* Above the block rather than under the notes: this is where a failed
          submit scrolls to, and from here the materials and the chart are in
          view below it. */}
      {error && <ErrorHelper>{error}</ErrorHelper>}

      <Stack spacing={1}>
        <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>
            {pricedPerTooth ? t('cnbForm.builder.materialPerTooth') : t('cnbForm.builder.material')}
          </Typography>

          {!notationInHeader && (
            <Box sx={{ ml: 'auto' }}>
              <NotationToggle notation={notation} onChange={onNotationChange} readOnly={readOnly} />
            </Box>
          )}
        </Stack>

        {/* Material selector: name and the lab's price per tooth. Selected is
            ink, like every other choice in the redesign. The material's own
            colour lives on the chart and, when an order mixes materials, on
            the tooth chips below. */}
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {materials.map((mat) => {
            const isSel = mat.id === selectedMaterialId;
            return (
              <Box
                key={mat.id}
                role="button"
                aria-pressed={isSel}
                tabIndex={readOnly ? -1 : 0}
                onClick={() => !readOnly && onSelectMaterial(mat.id)}
                onKeyDown={(e) => {
                  if (readOnly) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectMaterial(mat.id);
                  }
                }}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                  minHeight: 36,
                  px: 1.625,
                  py: 0.5,
                  maxWidth: '100%',
                  borderRadius: `${radii.control}px`,
                  border: 1,
                  borderColor: isSel ? 'primary.main' : ctrl,
                  bgcolor: isSel ? 'primary.main' : 'background.paper',
                  color: isSel ? 'primary.contrastText' : 'text.primary',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  lineHeight: 1.3,
                  cursor: readOnly ? 'default' : 'pointer',
                  userSelect: 'none',
                  transition: `all ${motion.base}`,
                  '&:hover': readOnly ? {} : { borderColor: 'primary.main' },
                  '&:focus-visible': focusVisible,
                }}
              >
                {mat.name}
                {pricedPerTooth && mat.unit_price != null && (
                  <Box
                    component="span"
                    sx={{
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      // On ink, a dimmed white; on white, the secondary grey.
                      color: isSel ? 'inherit' : 'text.secondary',
                      opacity: isSel ? 0.78 : 1,
                    }}
                  >
                    {formatGELShort(mat.unit_price)}
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>
      </Stack>

      <Box
        sx={{
          bgcolor: surfaces[mode].subtle,
          borderRadius: `${radii.tile}px`,
          px: 1,
          pt: 2,
          pb: 1.5,
        }}
      >
        <ToothMap
          value={NO_TEETH}
          onToothClick={handleToothClick}
          toothColors={toothColors}
          readOnly={readOnly}
          notation={notation}
          markedTeeth={markedTeeth}
        />
      </Box>

      {/* What's on the chart, tooth by tooth. Empty, it is the dashed
          "not yet" chip that tells the doctor what to do. */}
      {teeth.length === 0 ? (
        !readOnly && (
          <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 28,
                px: 1.25,
                borderRadius: `${radii.chipSm}px`,
                border: '1px dashed',
                borderColor: error ? 'error.main' : surfaces[mode].dashed,
                color: error ? 'error.main' : 'text.secondary',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              {t('cnbForm.builder.selectTooth')}
            </Box>
          </Stack>
        )
      ) : (
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', mr: 0.5 }}>
              {t('cnbForm.builder.selectedTeeth', { count: teeth.length })}
            </Typography>
            {teeth.map((x) => {
              const label = toDisplayLabel(x.tooth, notation);
              const price = x.price !== null ? formatGELShort(x.price) : null;
              return (
                <Box
                  key={x.tooth}
                  component="span"
                  title={[label, x.name, price].filter(Boolean).join(' · ')}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.625,
                    height: 28,
                    px: 1.125,
                    maxWidth: '100%',
                    borderRadius: `${radii.chipSm}px`,
                    bgcolor: aqua.bg,
                    color: aqua.fg,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {mixed && (
                    <Box
                      component="span"
                      sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: x.color, flexShrink: 0 }}
                    />
                  )}
                  <span>{label}</span>
                  {x.name && (
                    <>
                      <span aria-hidden>·</span>
                      {/* A lab's material name can run long ("veneer · feldspar
                          / disilicate / press"); the chip truncates it and the
                          title carries the rest. */}
                      <Box
                        component="span"
                        sx={{ minWidth: 0, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {x.name}
                      </Box>
                    </>
                  )}
                  {price && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{price}</span>
                    </>
                  )}
                </Box>
              );
            })}
          </Stack>

          {(subtotal !== null || !readOnly) && (
            <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
              {subtotal !== null && (
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  {t('cnbForm.builder.unitsSubtotal', {
                    count: teeth.length,
                    amount: formatGELShort(subtotal),
                  })}
                </Typography>
              )}
              {!readOnly && (
                <Box
                  component="button"
                  type="button"
                  onClick={() => onAssignmentsChange([])}
                  sx={{
                    ml: 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    p: 0,
                    border: 0,
                    bgcolor: 'transparent',
                    color: 'text.secondary',
                    fontFamily: 'inherit',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    borderRadius: `${radii.chipSm}px`,
                    transition: `color ${motion.fast}`,
                    '&:hover': { color: 'error.main' },
                    '&:focus-visible': focusVisible,
                  }}
                >
                  <Icon name="restart_alt" size={15} />
                  {t('cnbForm.builder.clear')}
                </Box>
              )}
            </Stack>
          )}
        </Stack>
      )}

      {/* Notes — still where a doctor spells out a bridge, which the chart
          itself has no way to say; hence the placeholder. One line that grows,
          as the design draws it. */}
      <TextField
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder={t('cnbForm.builder.notesPlaceholder')}
        multiline
        minRows={1}
        fullWidth
        InputProps={{ readOnly: !!readOnly, endAdornment: readOnly && <CopyAdornment text={notes} /> }}
        sx={{ '& .MuiInputBase-multiline': { py: '9px', px: '13px' } }}
      />
    </Stack>
  );
}

/**
 * Universal / FDI, as the design's segmented control: one bordered strip, the
 * chosen half filled in ink. Exported so a template can put it in its section
 * header, where the design has it.
 */
export function NotationToggle({
  notation,
  onChange,
  readOnly,
}: {
  notation: CnbNotation;
  onChange: (n: CnbNotation) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const theme = useTheme();
  const ctrl = surfaces[theme.palette.mode].control;
  return (
    <Box
      role="group"
      aria-label={tc('toothMap.notation')}
      sx={{
        display: 'inline-flex',
        border: 1,
        borderColor: ctrl,
        borderRadius: `${radii.control}px`,
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      {NOTATIONS.map((n) => {
        const on = n === notation;
        return (
          <Box
            key={n}
            component="button"
            type="button"
            aria-pressed={on}
            aria-disabled={readOnly || undefined}
            tabIndex={readOnly ? -1 : 0}
            onClick={() => !readOnly && !on && onChange(n)}
            sx={{
              height: 34,
              px: 1.5,
              border: 0,
              borderRight: 1,
              borderColor: ctrl,
              '&:last-of-type': { borderRight: 0 },
              bgcolor: on ? 'primary.main' : 'transparent',
              color: on ? 'primary.contrastText' : 'text.primary',
              fontFamily: 'inherit',
              fontSize: '0.8125rem',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              cursor: readOnly || on ? 'default' : 'pointer',
              transition: `background-color ${motion.fast}`,
              '&:hover': readOnly || on ? {} : { bgcolor: alpha(brand.main, 0.06) },
              // Inset: the strip's `overflow: hidden` clips an outer ring.
              '&:focus-visible': {
                outline: 'none',
                boxShadow: `inset 0 0 0 2px ${alpha(brand.main, 0.6)}`,
              },
            }}
          >
            {t(`cnbForm.options.${n}`, { defaultValue: n })}
          </Box>
        );
      })}
    </Box>
  );
}
