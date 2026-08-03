import { useEffect, useMemo } from 'react';
import { Alert, Box, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ToothMap, toDisplayLabel } from '@/components/ToothMap';
import { Icon, MetaChip } from '@/components/design';
import { formatGEL } from '@/utils/pricing';
import { motion, radii } from '@/theme/tokens';
import { PillGroup, ErrorHelper } from './primitives';
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
};

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
}: Props) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const materialColorById = useMemo(() => {
    const m: Record<string, string> = {};
    materials.forEach((mat, idx) => {
      m[mat.id] = materialColor(idx);
    });
    return m;
  }, [materials]);

  const toothColors = useMemo(() => {
    const m: Record<number, string> = {};
    for (const a of toothAssignments) {
      const c = materialColorById[a.materialId];
      if (c) m[a.tooth] = c;
    }
    return m;
  }, [toothAssignments, materialColorById]);

  const selectedTeeth = useMemo(
    () => toothAssignments.map((a) => a.tooth),
    [toothAssignments],
  );

  // One recap line per material actually painted, in the lab's material order.
  const perMaterial = useMemo(
    () =>
      materials
        .map((mat, i) => ({
          id: mat.id,
          name: mat.name,
          color: materialColor(i),
          teeth: toothAssignments
            .filter((a) => a.materialId === mat.id)
            .map((a) => a.tooth)
            .sort((a, b) => a - b),
        }))
        .filter((line) => line.teeth.length > 0),
    [materials, toothAssignments],
  );

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

  return (
    <Stack spacing={2}>
      {/* Notation toggle, right-aligned as in the mockups. */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>
          {t('cnbForm.builder.material')}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {tc('toothMap.notation')}
        </Typography>
        <PillGroup
          value={notation}
          onChange={onNotationChange}
          options={['Universal', 'FDI'] as const}
          getLabel={(o) => t(`cnbForm.options.${o}`, { defaultValue: o })}
          size="small"
          readOnly={readOnly}
        />
      </Stack>

      {/* Material selector — the mockups' 2px-outlined pill with a colour dot
          and the lab's per-unit price. */}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {materials.map((mat, i) => {
          const color = materialColor(i);
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
                px: 1.875,
                py: 1,
                borderRadius: `${radii.pill}px`,
                border: 2,
                borderColor: isSel ? color : 'divider',
                bgcolor: isSel ? color : 'background.paper',
                color: isSel ? '#ffffff' : 'text.primary',
                fontWeight: 600,
                fontSize: '0.8125rem',
                lineHeight: 1.3,
                cursor: readOnly ? 'default' : 'pointer',
                userSelect: 'none',
                transition: `all ${motion.base}`,
                '&:hover': readOnly ? {} : { borderColor: color },
              }}
            >
              <Box
                component="span"
                sx={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  flexShrink: 0,
                  bgcolor: color,
                  border: 1,
                  borderColor: isSel ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.12)',
                }}
              />
              {mat.name}
              {mat.unit_price != null && (
                <Box component="span" sx={{ fontWeight: 500, opacity: 0.75, fontSize: '0.75rem' }}>
                  {formatGEL(mat.unit_price)}
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>

      {!readOnly && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {t('cnbForm.builder.selectTooth')}
        </Typography>
      )}

      <ToothMap
        value={selectedTeeth}
        onToothClick={handleToothClick}
        toothColors={toothColors}
        readOnly={readOnly}
        notation={notation}
        markedTeeth={markedTeeth}
      />

      {/* Per-material recap, plus the mockups' dashed "clear" pill. */}
      {perMaterial.length > 0 && (
        <Stack direction="row" justifyContent="center" sx={{ flexWrap: 'wrap', gap: 1.25 }}>
          {perMaterial.map((line) => (
            <MetaChip key={line.id} swatch={line.color} bgcolor="background.default">
              {line.name} · {line.teeth.map((n) => toDisplayLabel(n, notation)).join(', ')}
            </MetaChip>
          ))}
          {!readOnly && (
            <Box
              component="button"
              type="button"
              onClick={() => onAssignmentsChange([])}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.625,
                px: 1.5,
                py: 0.625,
                borderRadius: `${radii.pill}px`,
                border: '1px dashed',
                borderColor: 'divider',
                bgcolor: 'transparent',
                color: 'text.secondary',
                fontFamily: 'inherit',
                fontSize: '0.71875rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all ${motion.fast}`,
                '&:hover': { color: 'error.main', borderColor: 'error.main' },
              }}
            >
              <Icon name="restart_alt" size={14} />
              {t('cnbForm.builder.clear')}
            </Box>
          )}
        </Stack>
      )}

      {/* Notes */}
      <TextField
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder={t('cnbForm.builder.notesPlaceholder')}
        multiline
        minRows={2}
        fullWidth
        InputProps={{ readOnly: !!readOnly }}
      />

      {error && <ErrorHelper>{error}</ErrorHelper>}
    </Stack>
  );
}
