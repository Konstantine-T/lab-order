import type { ReactNode } from 'react';
import { alpha, Box, Typography, useTheme, type SxProps, type Theme } from '@mui/material';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { ToothMap, toDisplayLabel } from '@/components/ToothMap';
import { palette2026, radii, surfaces, tone } from '@/theme/tokens';
import { formatGELShort } from '@/utils/pricing';
import { landingRadii } from './helpers';

/**
 * The hero's sample order: one case as a doctor sees it after sending it —
 * three zirconia crowns on the upper right, mid-way through the lab, with a
 * price and a date the lab has confirmed.
 *
 * Ported from the "შეკვეთა LO-1058" card of the 2026-09 landing design, with
 * two deliberate departures:
 *   - The code reads ORD-, the prefix the product actually issues.
 *   - The shade is a single "A2". The design's "A2 · ყელი A3" is a three-zone
 *     shade, which the order forms do not have yet.
 *
 * The chart is the app's real `ToothMap`, not the design's rounded pills: the
 * tooth outlines are frozen, and a doctor should see here the same chart they
 * will click on in the wizard.
 */

/** Universal 3, 4, 5 — FDI 16, 15, 14. `ToothMap` takes Universal numbers. */
const SELECTED_TEETH = [3, 4, 5];
const SHADE = 'A2';
const PRICE = 435;
const DUE_IN_DAYS = 5;
const ORDER_CODE = 'ORD-1058';

/** Sent → received → in progress → ready → completed; the card sits on the third. */
const STEP_COUNT = 5;
const CURRENT_STEP = 2;

// ToothMap draws both arches in a fixed `viewBox="20 30 400 660"` and scales
// it to its width. Only the upper arch belongs in the card, so the chart is
// cropped by a window of the same aspect as the part we want: 400 units wide,
// and from the top of the viewBox (y=30) down to y=341, just under the
// upper molars. Everything below — the side captions, the lower arch and
// the selection chips ToothMap renders under its SVG — falls outside.
// Cutting a unit or so off the last molars' outline is on purpose (the design
// crops its 18 and 28 too); stopping lower would show the tops of the R/L
// captions at y=350.
const VIEWBOX_WIDTH = 400;
const UPPER_ARCH_HEIGHT = 311;

// The design's phone layout — tighter padding, no facts row, no step names,
// the status tag beside the order code only — applies whenever the *card* is
// narrow, not only on a phone. The design's own two-column hero squeezes the
// card to ~360px around a 900px window, where the full layout truncates every
// step name and breaks the title after its "·". So this is a container query
// on the card's own width; below 440px the full layout no longer fits.
const COMPACT = '@container hero-order-card (max-width: 439px)';

export function HeroOrderCard() {
  const { t, i18n } = useTranslation('landing');
  const theme = useTheme();
  const mode = theme.palette.mode;
  const success = tone('success', mode);

  const rawSteps = t('heroCard.steps', { returnObjects: true }) as unknown;
  const steps = Array.isArray(rawSteps) ? (rawSteps as string[]) : [];

  // A due date that is always five days out, so the sample never reads as
  // an order that is already late. Formatted in the page's language rather
  // than dayjs's global locale, so a language switch is never a render behind.
  const due = dayjs()
    .add(DUE_IN_DAYS, 'day')
    .locale(i18n.resolvedLanguage ?? 'en')
    .format('D MMMM');

  // "16 · 15 · 14", from the same numbers the chart highlights.
  const teeth = SELECTED_TEETH.map((n) => toDisplayLabel(n, 'FDI')).join(' · ');

  return (
    // The query container. Its width comes from its parent (`width: 100%`),
    // never from the card inside it, which is what inline-size containment
    // requires.
    <Box
      sx={{
        width: '100%',
        // The design's cap for the stacked, single-column hero; in the
        // two-column hero the card is narrower than this anyway.
        maxWidth: 600,
        minWidth: 0,
        containerType: 'inline-size',
        containerName: 'hero-order-card',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          p: '24px 28px',
          bgcolor: 'background.paper',
          border: 1,
          borderColor: surfaces[mode].borderSolid,
          // The landing design's card radius, a step rounder than the app's.
          borderRadius: `${landingRadii.card}px`,
          boxShadow: `0 30px 60px -30px ${
            mode === 'light' ? alpha(palette2026.ink, 0.25) : alpha(theme.palette.common.black, 0.6)
          }`,
          [COMPACT]: { gap: 1.5, p: '18px 18px 16px' },
        }}
      >
        {/* Header: what the case is, and where it stands. At full width the
            status tag holds a right-hand column beside all three lines, as in
            the design. Compact, that column leaves the title ~20px short, so
            the tag sits beside the order code only and the title and patient
            run the full width under it. */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            alignItems: 'start',
            columnGap: 2,
            rowGap: '3px',
          }}
        >
          <Label sx={{ gridColumn: 1, gridRow: 1 }}>{t('heroCard.order', { code: ORDER_CODE })}</Label>
          <Tag
            sx={{
              gridColumn: 2,
              gridRow: '1 / span 3',
              // Compact, the 26px tag shares a row with an 18px caption; the
              // negative margin keeps it from pushing the title down.
              [COMPACT]: { gridRow: 1, mb: '-6px' },
            }}
          >
            <Box
              component="span"
              sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: success.dot, flexShrink: 0 }}
            />
            {steps[CURRENT_STEP]}
          </Tag>
          <Typography
            component="span"
            sx={{
              gridColumn: 1,
              gridRow: 2,
              fontSize: '1.0625rem',
              lineHeight: 1.35,
              fontWeight: 600,
              color: 'text.primary',
              [COMPACT]: { gridColumn: '1 / -1' },
            }}
          >
            {t('heroCard.title')}
          </Typography>
          <Typography
            component="span"
            sx={{
              gridColumn: 1,
              gridRow: 3,
              fontSize: '0.8125rem',
              lineHeight: 1.5,
              color: 'text.secondary',
              [COMPACT]: { gridColumn: '1 / -1' },
            }}
          >
            {t('heroCard.patient')}
          </Typography>
        </Box>

        {/* The upper arch, cropped out of the full chart. Read-only and
            pointer-less: ToothMap still hover-tints a tooth when `readOnly`,
            which on a picture would suggest it can be clicked. */}
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box
            role="img"
            aria-label={t('heroCard.chartLabel')}
            sx={{
              width: '100%',
              // Must stay under ToothMap's own 340px cap, or its SVG stops
              // filling the window and the crop no longer lines up.
              maxWidth: 320,
              aspectRatio: `${VIEWBOX_WIDTH} / ${UPPER_ARCH_HEIGHT}`,
              overflow: 'hidden',
              pointerEvents: 'none',
              userSelect: 'none',
              [COMPACT]: { maxWidth: 280 },
            }}
          >
            <ToothMap value={SELECTED_TEETH} readOnly notation="FDI" />
          </Box>
        </Box>

        {/* The order's facts. The phone design drops this row and the step
            names to keep the card short; the chart and the bar carry it. */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '10px',
            py: '12px',
            borderTop: 1,
            borderBottom: 1,
            borderColor: 'divider',
            [COMPACT]: { display: 'none' },
          }}
        >
          <Fact label={t('heroCard.teeth')} value={teeth} />
          <Fact label={t('heroCard.shade')} value={SHADE} />
          <Fact label={t('heroCard.files')} value={t('heroCard.filesValue')} />
        </Box>

        {/* Progress: aqua is done (and the stage in hand), dashed grey is not yet. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Box aria-hidden sx={{ display: 'flex', gap: '5px' }}>
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <Box
                key={i}
                sx={{
                  flex: 1,
                  height: 6,
                  borderRadius: '3px',
                  background:
                    i <= CURRENT_STEP
                      ? palette2026.aqua
                      : `repeating-linear-gradient(90deg, ${surfaces[mode].dashed} 0 6px, transparent 6px 11px)`,
                }}
              />
            ))}
          </Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '6px',
              fontSize: '0.6875rem',
              fontWeight: 500,
              lineHeight: 1.5,
              color: 'text.secondary',
              whiteSpace: 'nowrap',
              [COMPACT]: { display: 'none' },
            }}
          >
            {steps.map((label, i) => (
              <Box
                key={i}
                component="span"
                // Should a longer translation still run out of room, the
                // other names give way before the current one does.
                sx={
                  i === CURRENT_STEP
                    ? { flexShrink: 0, color: success.fg, fontWeight: 600 }
                    : { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }
                }
              >
                {label}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Footer: the confirmed date and price. */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            columnGap: 3,
            rowGap: 1.25,
            pt: '4px',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            color: 'text.primary',
          }}
        >
          <Box component="span">
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {t('heroCard.due')}
            </Box>{' '}
            <Box component="b" sx={{ fontWeight: 700 }}>
              {due}
            </Box>
          </Box>
          <Box component="span">
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {t('heroCard.price')}
            </Box>{' '}
            <Box component="b" sx={{ fontWeight: 700 }}>
              {formatGELShort(PRICE)}
            </Box>
          </Box>
          {/* Compact, the pill wraps under the two figures, flush left. */}
          <Tag sx={{ ml: 'auto', [COMPACT]: { ml: 0 } }}>
            <Icon
              name="check"
              size={14}
              // The design's tick is drawn heavier than the text beside it.
              sx={{ fontVariationSettings: "'FILL' 0, 'wght' 600, 'GRAD' 0, 'opsz' 20" }}
            />
            {t('heroCard.confirmed')}
          </Tag>
        </Box>
      </Box>
    </Box>
  );
}

/** The design's small grey caption: 12px / 600 / secondary. */
function Label({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography
      component="span"
      sx={[
        { fontSize: '0.75rem', lineHeight: 1.5, fontWeight: 600, letterSpacing: '0.02em', color: 'text.secondary' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <Label>{label}</Label>
      <Typography
        component="span"
        sx={{
          fontSize: '0.875rem',
          lineHeight: 1.5,
          fontWeight: 600,
          color: 'text.primary',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/**
 * The design's square-cornered status tag — 26px tall, 7px radius — in the
 * aqua "done / confirmed" tone. Not `StatusPill`, which is the app's fully
 * round pill at a smaller size.
 */
function Tag({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  const mode = useTheme().palette.mode;
  const success = tone('success', mode);
  return (
    <Box
      component="span"
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
          height: 26,
          px: '9px',
          borderRadius: `${radii.chipSm}px`,
          fontSize: '0.75rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          bgcolor: success.bg,
          color: success.fg,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
