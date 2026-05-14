import { useEffect, useMemo } from 'react';
import { Alert, Box, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ToothMap } from '@/components/ToothMap';
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
      {/* Material selector */}
      <Stack spacing={1}>
        <Typography variant="body2" fontWeight={600}>
          {t('cnbForm.builder.material')}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
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
                  px: 2,
                  py: 0.85,
                  borderRadius: 999,
                  border: 2,
                  borderColor: isSel ? color : 'divider',
                  bgcolor: isSel ? color : 'background.paper',
                  color: isSel ? '#ffffff' : 'text.primary',
                  fontWeight: 500,
                  fontSize: 14,
                  cursor: readOnly ? 'default' : 'pointer',
                  userSelect: 'none',
                  boxShadow: isSel ? 0 : 1,
                  '&:hover': readOnly ? {} : { borderColor: color },
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: color,
                    border: 1,
                    borderColor: isSel ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.15)',
                  }}
                />
                {mat.name}
              </Box>
            );
          })}
        </Stack>
      </Stack>

      {/* Tooth chart with notation toggle */}
      <Stack spacing={1}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="body2" fontWeight={600}>
            {t('cnbForm.builder.selectTooth')}
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
        <ToothMap
          value={selectedTeeth}
          onToothClick={handleToothClick}
          toothColors={toothColors}
          readOnly={readOnly}
          notation={notation}
        />
      </Stack>

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
