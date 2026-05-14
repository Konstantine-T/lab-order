import { useState } from 'react';
import { Box, Stack, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';

// Universal Numbering System (1–32) — adult permanent dentition.
//   1–16: maxillary (upper), patient's right (1) → patient's left (16)
//  17–32: mandibular (lower), patient's left (17) → patient's right (32)
// Drawn from the dentist's mirror perspective: patient's right on viewer's left.
type Polygon = { num: number; kind: 'polygon'; points: string };
type PathTooth = { num: number; kind: 'path'; d: string };
type Tooth = Polygon | PathTooth;

const TEETH: Tooth[] = [
  // ── Maxillary (upper arch) ───────────────────────────────────────────────
  { num: 1, kind: 'polygon', points: '33,314.3 38,325.7 45.7,335.7 55.7,341.7 64.7,343 73.3,340 77.7,335.7 81.3,326.3 82,314.3 81.3,302 80.7,292.7 73.7,292 51.3,293.7 38.7,293.7 34,298 31.7,302.3 32,311' },
  { num: 2, kind: 'polygon', points: '79.7,288.3 71.7,291 55,293 40.3,291.3 36,287 33,273.7 36.3,260 42,248.7 44.7,244.7 50.3,246.7 56,249 65.3,250.7 74,249.7 80.3,249.7 82.3,254 85.3,259.3 87,267.7 87.7,274.7 85.3,282.7' },
  { num: 3, kind: 'path', d: 'M92.7,207.3l2,5.3l-1.7,8l-1.7,9l-4,8l-5,7.7l-11,4.7l-13.7,0.7l-10-7l-1.7-5L45,220l3-10.7l5-7.3l4-3.3l4.7-2.7l5.3,3.7l6.7,1.3c0,0,7.3,1.3,9.3,1.3s6.3,0.7,6.3,0.7L92.7,207.3z' },
  { num: 4, kind: 'polygon', points: '82,155.3 102.3,163.3 108.7,172 109.3,182 104.7,192 100,199 94,203.7 85.3,201.7 73.7,201 64.3,196.7 60.3,190.7 59,183.3 61.7,175.3 66.3,167.7 71.3,161.3' },
  { num: 5, kind: 'polygon', points: '109,116.7 116,122.3 122.7,125.3 127.7,131.3 128.3,141 122.7,153.7 114,161.7 105.7,162.3 96.7,161 85.7,156 82,150 81,139.3 86.3,128 93,121.3 100.7,117.3' },
  { num: 6, kind: 'polygon', points: '126.3,82 134.3,86.3 139.7,92.3 144.7,104.7 145.7,115.3 143.7,120.7 138,124.3 131.3,125 121,125 114.7,119.3 110.3,112.3 108.3,104.7 108.7,94.7 110.7,88.7 116,84' },
  { num: 7, kind: 'path', d: 'M167,55l6.7,6.3L174,68l0.3,8l1,10l-2,8.3l-4.7,4.3l-6.7,1.7l-8-4.3l-7.3-4.7l-9.3-4.7l-6.3-5.3l-1-4.3l1.3-5c0,0,3.3-6,4.3-6s5.3-6,6.3-6s10.3-4.7,10.3-4.7L167,55z' },
  { num: 8, kind: 'polygon', points: '176.7,46.3 195,41 203.3,39.7 209.3,40.7 215.3,42.7 217,47 217.7,54.3 215,64.7 212.3,75.7 208,83 201.7,85.7 195.7,86.7 189.7,83.3 183.7,74.7 175,62 171.7,54 172.7,49.7' },
  { num: 9, kind: 'polygon', points: '273.3,52 266.7,61.7 258.3,72.3 253.3,79.7 247.3,85 239,87.7 232.3,82 224.7,67 222,58.3 219,50 220,44.3 224.3,40.3 230,38.7 237.3,38.7 253,39.3 258.7,41.3 264.3,43.7 268.3,45.7' },
  { num: 10, kind: 'polygon', points: '310.3,83.3 298,90.7 286,95 276.3,98.3 270.3,93.3 269,82.7 269,69.3 270,58.7 274.7,54.7 282,53 287.7,54.7 297.3,60.3 304,64.3 308.7,68.7 312.3,74 313,81' },
  { num: 11, kind: 'polygon', points: '336,93.3 337.7,100 336,104.7 332.7,113.7 324.3,121.3 315.3,125.7 306.3,126 297.3,120.3 294,112 295.7,102.7 299,95 303.3,90 309.3,88 316.3,87.3 322.7,87.3 328,88.3' },
  { num: 12, kind: 'polygon', points: '358.7,134.3 360.3,145.7 357.3,152.7 352,157.3 346.3,161 336,164 329.7,163.3 321.7,157.7 314.3,149 310.7,139.3 310,133.7 312.3,127 318.3,125.7 326,122 332.7,116 334.7,114.3 337.7,117.3 343.3,119.7 348.7,122.7 354.3,127.7' },
  { num: 13, kind: 'polygon', points: '386,188.7 383.3,192.7 377.7,196 356.3,203.3 345.7,202.3 341.7,199.7 338.7,196.3 335,188.7 332,177 333.7,169.7 338,164.7 346.3,161 353.7,156.7 360.3,150.3 364,151 370.7,156.3 376.3,164.3 380,170.3 383.3,178.3' },
  { num: 14, kind: 'polygon', points: '359.7,243.7 350.7,224 345.7,211.7 348.7,205 358.3,202.7 375.7,197 388.7,193 393,196 399.3,207 401.3,222.7 400,234.3 394.7,240.7 381.7,244.7 371,246' },
  { num: 15, kind: 'polygon', points: '362.3,247.3 357.3,251 357,259.3 358.7,268 359.7,279.7 361.3,286.7 365,291.7 371,294.3 392,295 404.3,293.7 410,280.7 412,263.3 407.3,246.7 401,240.3 396,239.7 389.3,243' },
  { num: 16, kind: 'polygon', points: '404.3,293.7 408.7,299.3 408.7,308 405.3,318.7 401,329.7 392.3,339.7 382.7,341 369,339.7 359,335 354.7,327.7 354.3,316 358.3,304 363.7,294 368.7,294.7 378.7,296 389,296' },

  // ── Mandibular (lower arch) ──────────────────────────────────────────────
  { num: 17, kind: 'polygon', points: '371.7,417 378.3,417.3 386.7,415.7 391.7,415.3 397.3,417.7 402.7,416.3 407.7,409.7 406.7,395 401,377.7 397.3,373 390.7,367.3 380,365 373,366.7 367.3,369 364,374.3 360,389 363.3,401.3 367.7,412.3' },
  { num: 18, kind: 'polygon', points: '410,435 408.7,447.3 404.3,459 399.3,467.7 393.7,468 388,466 376.3,466.3 369.7,466.3 365.7,460 364.7,444.7 366.3,434.3 369,424 378.3,417.3 386.7,415.7 391.7,415.3 396,418 399.7,418 404,421.7 407.7,427.3' },
  { num: 19, kind: 'path', d: 'M398,470l4.7,5.7l3,7.7l-0.3,11.7l-6,13.3l-6.3,10.3l-8.3,4.3l-7.3-1l-16.3-7c0,0-2.7-6-3-7.3c-0.3-1.3-0.3-11-0.3-11l3.7-14.3l3.7-7l5.3-6.7l8-2l9.7-0.7L398,470z' },
  { num: 20, kind: 'polygon', points: '334,561 338.7,566 346,570 354.7,573 360.7,571.7 368,568.3 383,545 385.3,532.7 381.3,524.3 374,520.7 363.7,516.3 356.3,515.3 351.3,518.3 346.3,524 340.3,534.3 336,546.7' },
  { num: 21, kind: 'polygon', points: '331,565.7 335,565.7 341.3,568 349.3,574.3 352.3,578.3 352.7,583.7 350.7,593.7 342.7,604 337.7,609 328,612.7 320,613.3 315,611 308.3,604.7 306.7,598 307.3,591.3 309,584.7 312.7,578.3 318.3,571.7' },
  { num: 22, kind: 'polygon', points: '286,629.3 286.7,633.3 291.3,638.7 295.3,642.3 302,644 311.7,643.3 318.3,637.7 321,630 321.3,620.3 317,614.3 308,608 298.3,607 291,609.3 287,612.3 286.7,617.7 287.3,624.7' },
  { num: 23, kind: 'polygon', points: '269.3,624 273.3,624.7 275.3,627.3 279,628.7 281.7,631.3 285.3,634.7 289.3,638.3 292,643.3 291.3,650 287,655 280.7,658.7 272,660 265,660.7 261.3,657.3 261.7,650 263.7,637 264.3,627' },
  { num: 24, kind: 'path', d: 'M235.3,637c0,0,3-2,4-2.3c1-0.3,4.3,0,4.3,0l5,4.3l5.3,7.3l3.3,6.7l2,7.3l-2,3l-7.7,2.7l-10,0.3h-10l-2-6.7l2.7-7.3L235.3,637z' },
  { num: 25, kind: 'polygon', points: '214,637 218,642.7 223,654.3 225.7,664 225.3,666.3 219,668.3 206.7,668 196,665.7 190.3,662.7 193,657.3 199.7,647.3 207,638 210.7,635.5' },
  { num: 26, kind: 'polygon', points: '178.3,627 186,629 187.7,633.7 188.7,644 189,657 189.3,662.7 186.3,663.7 176.7,663 168,656.3 159.3,649.7 156.7,644 162,639.3' },
  { num: 27, kind: 'polygon', points: '155.7,611 160.3,615.3 165,624.7 161.7,634.3 156,641.3 149,644 140.7,644.3 133.3,641.3 128.7,634.7 128.7,629 132.7,621.3 137.7,615 143.7,611 149.7,610' },
  { num: 28, kind: 'path', d: 'M117.3,569.7l7.7,1.3l6.3,3.7l6.3,7.7l4,8.3L144,602l-1.3,6.7l-6.7,6.7l-7.7,3.3l-7.3-1l-7-3l-7.3-7l-5-9l-2-10c0,0-0.7-7,0.3-7.3c1-0.3,5.3-6.7,5.3-6.7l9-5H117.3z' },
  { num: 29, kind: 'polygon', points: '93.3,525 99.3,527.3 108.3,536 114,546.7 115.7,559.3 114.3,567.3 106.3,573 98.3,578.3 88,579 82,575 75,565 69.3,552.3 67.3,542 69.7,536 74.3,531.7 84.3,528.3' },
  { num: 30, kind: 'polygon', points: '78.7,476 85,481 90.3,488.3 96.3,499.3 97.7,511.3 93,522 86,526.3 67,533 60.3,529.7 56.3,523.7 51.7,511 47.7,494.7 47.7,488.3 50.3,483.3 55,479.7 67,476.7' },
  { num: 31, kind: 'polygon', points: '76,425.7 80.3,427.7 83.3,433 85.3,447.7 84.3,458.7 79.7,472.3 73,475 50.3,479.7 46.7,476.7 37.7,446.3 39.7,438.3 43.3,432 49,426.7 56,424.7 65,424.7' },
  { num: 32, kind: 'polygon', points: '66.7,369.7 59,370.3 51,373.7 43.7,384.3 42.3,392 38.7,406 41,415.3 44.3,420.3 47.3,424 51.7,424.3 57.7,424 62.3,422.7 66.7,422.7 71,424.3 76.3,422.7 80.7,419.3 84.7,412.3 85.3,405 87.3,391.7 85,380 80.7,375 73.7,371.3' },
];

// Universal (1–32) ↔ FDI conversion. Internal storage stays Universal —
// only displayed labels change when notation === 'FDI'.
export const UNIVERSAL_TO_FDI: Record<number, number> = {
  1: 18, 2: 17, 3: 16, 4: 15, 5: 14, 6: 13, 7: 12, 8: 11,
  9: 21, 10: 22, 11: 23, 12: 24, 13: 25, 14: 26, 15: 27, 16: 28,
  17: 38, 18: 37, 19: 36, 20: 35, 21: 34, 22: 33, 23: 32, 24: 31,
  25: 41, 26: 42, 27: 43, 28: 44, 29: 45, 30: 46, 31: 47, 32: 48,
};

export function toDisplayLabel(num: number, notation: 'Universal' | 'FDI'): string {
  return notation === 'FDI' ? String(UNIVERSAL_TO_FDI[num] ?? num) : String(num);
}

// Approximate centroid of each tooth, used to position the number label.
// Hand-tuned for readability rather than mathematically precise.
const LABELS: Record<number, { x: number; y: number }> = {
  1: { x: 57, y: 318 }, 2: { x: 60, y: 270 }, 3: { x: 68, y: 222 }, 4: { x: 85, y: 182 },
  5: { x: 105, y: 142 }, 6: { x: 127, y: 105 }, 7: { x: 156, y: 76 }, 8: { x: 196, y: 64 },
  9: { x: 246, y: 64 }, 10: { x: 290, y: 75 }, 11: { x: 316, y: 106 }, 12: { x: 335, y: 142 },
  13: { x: 357, y: 182 }, 14: { x: 374, y: 222 }, 15: { x: 384, y: 270 }, 16: { x: 380, y: 318 },
  17: { x: 384, y: 392 }, 18: { x: 387, y: 442 }, 19: { x: 380, y: 495 }, 20: { x: 360, y: 545 },
  21: { x: 330, y: 590 }, 22: { x: 304, y: 626 }, 23: { x: 277, y: 643 }, 24: { x: 240, y: 650 },
  25: { x: 209, y: 654 }, 26: { x: 175, y: 645 }, 27: { x: 145, y: 627 }, 28: { x: 119, y: 596 },
  29: { x: 92, y: 552 }, 30: { x: 73, y: 504 }, 31: { x: 62, y: 452 }, 32: { x: 63, y: 397 },
};

type Props = {
  value?: number[];
  onChange?: (next: number[]) => void;
  /** When set, tooth click delegates to this handler instead of the default
   * toggle-and-fire-onChange behavior. */
  onToothClick?: (num: number) => void;
  /** Per-tooth fill color override (e.g. material assignments). */
  toothColors?: Record<number, string>;
  readOnly?: boolean;
  notation?: 'Universal' | 'FDI';
  /** When provided, teeth NOT in this set are dimmed and non-interactive. */
  restrictToTeeth?: Set<number>;
};

export function ToothMap({
  value = [],
  onChange,
  onToothClick,
  toothColors,
  readOnly,
  notation = 'Universal',
  restrictToTeeth,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation('common');
  const [hovered, setHovered] = useState<number | null>(null);
  const selected = new Set(value);

  const handleClick = (n: number) => {
    if (readOnly) return;
    if (restrictToTeeth && !restrictToTeeth.has(n)) return;
    if (onToothClick) {
      onToothClick(n);
      return;
    }
    if (!onChange) return;
    const next = new Set(selected);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    onChange([...next].sort((a, b) => a - b));
  };

  const upperSelected = value.filter((n) => n >= 1 && n <= 16);
  const lowerSelected = value.filter((n) => n >= 17 && n <= 32);

  // High-contrast tooth outline color so the chart reads cleanly against any
  // background (page or card). Way more visible than the theme's `divider`.
  const isLight = theme.palette.mode === 'light';
  const baseStroke = isLight ? 'rgba(15, 23, 42, 0.55)' : 'rgba(229, 231, 240, 0.7)';
  const midlineStroke = isLight ? 'rgba(15, 23, 42, 0.18)' : 'rgba(229, 231, 240, 0.22)';
  const labelColor = isLight ? '#0F172A' : '#E5E7F0';

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ maxWidth: 380, mx: 'auto' }}>
        <Box
          component="svg"
          viewBox="20 30 400 660"
          sx={{ width: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label={t('toothMap.ariaLabel')}
        >
          {/* Midlines */}
          <line
            x1={219}
            y1={35}
            x2={219}
            y2={685}
            stroke={midlineStroke}
            strokeWidth={0.6}
            strokeDasharray="3,3"
          />
          <line
            x1={25}
            y1={355}
            x2={415}
            y2={355}
            stroke={midlineStroke}
            strokeWidth={0.6}
            strokeDasharray="3,3"
          />

          {TEETH.map((t) => {
            const isSel = selected.has(t.num);
            const isHov = hovered === t.num;
            const colorOverride = toothColors?.[t.num];
            const isRestricted = restrictToTeeth ? !restrictToTeeth.has(t.num) : false;
            const fill = colorOverride
              ? colorOverride
              : isSel
                ? theme.palette.primary.main
                : isHov && !isRestricted
                  ? theme.palette.action.hover
                  : theme.palette.background.paper;
            const stroke = colorOverride
              ? colorOverride
              : isSel
                ? theme.palette.primary.dark
                : isHov && !isRestricted
                  ? theme.palette.primary.light
                  : baseStroke;
            const sw = isSel || colorOverride ? 1.8 : 1.4;

            const eventProps = {
              onClick: () => handleClick(t.num),
              onMouseEnter: () => !isRestricted && setHovered(t.num),
              onMouseLeave: () => setHovered(null),
              style: {
                cursor: readOnly || isRestricted ? 'default' : 'pointer',
                opacity: isRestricted ? 0.22 : 1,
                transition: 'fill 120ms, stroke 120ms',
              },
              fill,
              stroke,
              strokeWidth: sw,
            };

            const titleEl = <title>{`Tooth ${t.num}`}</title>;

            if (t.kind === 'polygon') {
              return (
                <polygon key={t.num} points={t.points} {...eventProps}>
                  {titleEl}
                </polygon>
              );
            }
            return (
              <path key={t.num} d={t.d} {...eventProps}>
                {titleEl}
              </path>
            );
          })}

          {/* Tooth number labels */}
          {TEETH.map((t) => {
            const pos = LABELS[t.num];
            if (!pos) return null;
            const isSel = selected.has(t.num);
            const hasColor = !!toothColors?.[t.num];
            return (
              <text
                key={`label-${t.num}`}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11.5}
                fontWeight={700}
                fill={
                  hasColor
                    ? '#ffffff'
                    : isSel
                      ? theme.palette.primary.contrastText
                      : labelColor
                }
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {toDisplayLabel(t.num, notation)}
              </text>
            );
          })}
        </Box>
      </Box>

      {value.length > 0 && (
        <Stack
          direction="row"
          spacing={3}
          justifyContent="center"
          sx={{ mt: 1, color: 'text.secondary' }}
        >
          {upperSelected.length > 0 && (
            <Typography variant="caption">
              {t('toothMap.upper')}: {upperSelected.map((n) => toDisplayLabel(n, notation)).join(', ')}
            </Typography>
          )}
          {lowerSelected.length > 0 && (
            <Typography variant="caption">
              {t('toothMap.lower')}: {lowerSelected.map((n) => toDisplayLabel(n, notation)).join(', ')}
            </Typography>
          )}
          <Typography variant="caption" fontWeight={600}>
            {t('toothMap.total')}: {value.length}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
